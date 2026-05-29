const { z } = require('zod');
const { ChatGroq } = require('@langchain/groq');
const { ChatOpenAI } = require('@langchain/openai');
const {
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate
} = require('@langchain/core/prompts');
const { StructuredOutputParser } = require('@langchain/core/output_parsers');
const AuthorizedDevice = require('../data/models/Device');
const { fetchLatestSnapshotsForSensors, pickNumericEntries, parseNumericValue } = require('./sensorDataService');

const layoutSchema = z.object({
    span: z.number().int().min(1).max(3).optional(),
    height: z.number().int().min(120).max(500).optional()
});

const liveSourceSchema = z.object({
    sensorId: z.string(),
    key: z.string(),
    label: z.string().optional()
});

const metricSchema = z.object({
    label: z.string(),
    value: z.string(),
    unit: z.string().optional(),
    trend: z.string().optional(),
    accent: z.enum(['success', 'warning', 'danger', 'info']).optional()
});

const chartDataItemSchema = z.object({
    label: z.string(),
    value: z.number(),
    baseline: z.number().optional()
});

const chartBaseSchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    data: z.array(chartDataItemSchema).min(1).max(12),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    color: z.string().optional(),
    layout: layoutSchema.optional(),
    liveSource: liveSourceSchema.optional(),
    liveWindow: z.number().int().min(6).max(120).optional()
});

const widgetSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('metric_card'),
        title: z.string(),
        description: z.string().optional(),
        metrics: z.array(metricSchema).min(1).max(4),
        layout: layoutSchema.optional()
    }),
    z.object({
        type: z.literal('table'),
        title: z.string(),
        description: z.string().optional(),
        columns: z.array(z.string()).min(3).max(6),
        rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean()]))).min(1).max(8),
        layout: layoutSchema.optional()
    }),
    chartBaseSchema.extend({ type: z.literal('line_chart') }),
    chartBaseSchema.extend({ type: z.literal('bar_chart') })
]);

const dashboardSchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    widgets: z.array(widgetSchema).min(2).max(6)
});

const parser = StructuredOutputParser.fromZodSchema(dashboardSchema);
const formatInstructions = parser.getFormatInstructions();

const promptTemplate = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
        'Eres un arquitecto de dashboards de microrredes. Organiza la información en widgets accionables y describe la lógica en formato JSON estrictamente válido. '
        + 'Los sensores disponibles se listan con su ID, variables disponibles (keys) y última lectura. '
        + 'Para los gráficos line_chart y bar_chart usa siempre las keys reales del sensor en liveSource.key (ej. v, c, p, Temp, etc.) '
        + 'y asigna un título descriptivo. Cada chart debe contener al menos 3 puntos con etiquetas y valores distintos.'
    ),
    HumanMessagePromptTemplate.fromTemplate(`
Genera un dashboard en JSON siguiendo estas instrucciones:
{format_instructions}

Contexto:
{context}

Solicitud:
{user_prompt}
`)
]);

const providerFromEnv = () => (process.env.LLM_PROVIDER || 'groq').toLowerCase();
const parseNumeric = (value, fallback) => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const createLLM = () => {
    const provider = providerFromEnv();
    const temperature = parseNumeric(process.env.LLM_TEMPERATURE, 0.25);
    const maxTokens = parseNumeric(process.env.LLM_MAX_TOKENS, 2000);

    if (provider === 'groq') {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return null;
        return new ChatGroq({
            apiKey,
            model: process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile',
            temperature,
            maxTokens,
            baseUrl: process.env.GROQ_API_BASE_URL || 'https://api.groq.ai/v1'
        });
    }

    if (provider === 'openai') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return null;
        return new ChatOpenAI({
            openAIApiKey: apiKey,
            modelName: process.env.OPENAI_MODEL_NAME || 'gpt-5.4-nano',
            temperature,
            maxTokens
        });
    }

    return null;
};

const normalizeDevices = (items) => {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
        const rawId = item._id ?? item.id;
        const sensorId = rawId?.toString ? rawId.toString() : rawId;
        return {
            _id: sensorId,
            name: item.name || 'Sensor sin nombre',
            type: item.type || 'desconocido',
            status: item.status || 'active'
        };
    });
};

const formatDeviceLine = (device) => {
    const id = device._id ?? device.id;
    const sensorId = id?.toString ? id.toString() : id;
    return `${device.name} (${device.type}) · ID=${sensorId}`;
};

const buildContext = (devices, extraContext) => {
    const context = [];
    if (extraContext) {
        context.push(extraContext);
    }
    if (devices?.length) {
        const deviceLines = devices.map(formatDeviceLine).join('\n');
        context.push(`Sensores autorizados (${devices.length}):\n${deviceLines}`);
    }
    return context.length ? context.join('\n\n') : 'Sin contexto adicional.';
};

const buildLiveSensorCandidates = (devices, snapshots) => {
    return (devices || []).map((device) => {
        const sensorId = device._id?.toString ? device._id.toString() : device._id;
        return {
            sensorId,
            name: device.name || 'Sensor sin nombre',
            snapshots: snapshots?.[sensorId] || []
        };
    });
};

const buildSensorContext = (candidates) => {
    if (!candidates?.length) return '';
    const lines = candidates.map(({ name, sensorId, snapshots }) => {
        const snapshot = snapshots?.[0];
        if (!snapshot) {
            return `${name} (${sensorId}): sin datos recientes.`;
        }
        const allKeys = Object.keys(snapshot).filter(
            (k) => k !== 'createAt' && k !== '_id' && k !== 'timestamp' && k !== 'sensorId'
        );
        const numericEntries = pickNumericEntries(snapshot, 6);
        const numericPart = numericEntries.length
            ? numericEntries.map((entry) => `${entry.key}=${Number(entry.value).toFixed(2)}`).join(', ')
            : 'sin valores numéricos';
        return `${name} (${sensorId}) · variables [${allKeys.join(', ')}] · última: ${numericPart}`;
    });
    return lines.join('\n');
};

const pickLiveKeyFromCandidate = (candidate) => {
    const source = candidate?.snapshots?.[0];
    if (!source) return null;
    const entries = pickNumericEntries(source, 1);
    return entries[0]?.key || null;
};

const ensureLiveSources = (spec, candidates, devices) => {
    if (!spec?.widgets?.length) return spec;

    const chartTypes = new Set(['line_chart', 'bar_chart']);
    let pointer = 0;

    const widgets = spec.widgets.map((widget) => {
        if (widget.type === 'table') {
            return {
                ...widget,
                columns: ['Nombre', 'Tipo', 'ID', 'Estado'],
                rows: buildTableRows(devices)
            };
        }

        if (widget.type === 'metric_card' && candidates.length) {
            const realMetrics = candidates
                .map(formatMetricCandidate)
                .filter(Boolean)
                .slice(0, 4);
            if (realMetrics.length) {
                return { ...widget, metrics: realMetrics };
            }
        }

        if (chartTypes.has(widget.type)) {
            let candidate = null;
            let chosenKey = null;

            if (widget.liveSource) {
                candidate = candidates.find((c) => c.sensorId === widget.liveSource.sensorId);
                if (candidate) {
                    const source = candidate.snapshots?.[0];
                    if (source && widget.liveSource.key in source) {
                        chosenKey = widget.liveSource.key;
                    }
                }
            }

            if (!candidate || !chosenKey) {
                const usable = candidates
                    .map((c) => ({ ...c, key: pickLiveKeyFromCandidate(c) }))
                    .filter((e) => e.key);
                if (!usable.length) return ensureWidgetHasMinimumData(widget, null, 3);
                candidate = usable[pointer % usable.length];
                pointer += 1;
                chosenKey = candidate.key;
            }

            const chartData = buildChartDataFromKey(candidate, chosenKey);
            const data = chartData.length >= 3 ? chartData : padSeriesToMinimum(chartData, 3);
            return {
                ...widget,
                data,
                xLabel: widget.xLabel || 'Tiempo',
                yLabel: widget.yLabel || chosenKey,
                color: widget.color || '#22c55e',
                liveSource: {
                    sensorId: candidate.sensorId,
                    key: chosenKey,
                    label: candidate.name
                },
                liveWindow: widget.liveWindow ?? 32
            };
        }

        return widget;
    });

    return { ...spec, widgets };
};

const formatMetricCandidate = (candidate) => {
    const source = candidate?.snapshots?.[0];
    const key = pickLiveKeyFromCandidate(candidate);
    if (!source || !key) return null;
    const value = parseNumericValue(source[key]);
    if (value === null) return null;
    return {
        label: `${candidate.name} · ${key}`,
        value: `${Number(value).toFixed(2)}`,
        unit: '',
        trend: `${candidate.snapshots.length} muestras`,
        accent: 'info'
    };
};

const buildTableRows = (devices) => {
    return (devices?.length ? devices : [{ _id: 'demo', name: 'Sensor demo', type: 'solar', status: 'active' }]).map((sensor) => ({
        Nombre: sensor.name || 'Sensor sin nombre',
        Tipo: sensor.type || 'desconocido',
        ID: sensor._id?.toString ? sensor._id.toString() : (sensor._id || '—'),
        Estado: sensor.status || 'activo'
    }));
};

const sanitizeSeries = (series) => {
    if (!Array.isArray(series)) return [];
    return series.map((doc, index) => {
        const rawValue = doc?.value ?? doc?.valor ?? doc?.cantidad ?? doc?.amount ?? doc?.data ?? null;
        const parsed = parseNumericValue(rawValue);
        return {
            label: String(doc?.label ?? doc?.name ?? doc?.nombre ?? `punto ${index + 1}`),
            value: parsed === null ? 0 : parsed
        };
    }).filter((point) => Number.isFinite(point.value));
};

const padSeriesToMinimum = (series, min = 3) => {
    const working = Array.isArray(series) ? [...series] : [];
    if (!working.length) {
        return Array.from({ length: min }, (_, index) => ({ label: `punto ${index + 1}`, value: 0 }));
    }
    const result = [...working];
    while (result.length < min) {
        const last = result[result.length - 1];
        result.push({ label: `${last.label} ${result.length + 1}`, value: last.value });
    }
    return result.slice(-min);
};

const buildChartDataFromCandidate = (candidate) => {
    const key = pickLiveKeyFromCandidate(candidate);
    if (!key) return [];
    return buildChartDataFromKey(candidate, key);
};

const buildChartDataFromKey = (candidate, key) => {
    if (!candidate?.snapshots?.length || !key) return [];
    const sorted = [...candidate.snapshots]
        .sort((a, b) => new Date(a.createAt || a.timestamp || 0) - new Date(b.createAt || b.timestamp || 0));
    return sorted.map((doc) => {
        const raw = doc[key];
        const value = parseNumericValue(raw);
        if (value === null) return null;
        const label = new Date(doc.createAt || doc.timestamp || Date.now()).toLocaleTimeString();
        return { label, value };
    }).filter(Boolean);
};

const ensureWidgetHasMinimumData = (widget, candidate, minPoints = 3) => {
    const current = sanitizeSeries(widget.data || []);
    if (current.length >= minPoints) {
        return { ...widget, data: current };
    }
    const fallback = sanitizeSeries(buildChartDataFromCandidate(candidate));
    const base = fallback.length ? fallback : current.length ? current : [{ label: 'punto 1', value: 0 }];
    return { ...widget, data: padSeriesToMinimum(base, minPoints) };
};

const createFallbackSpec = (promptText, context, devices, liveCandidates) => {
    const metrics = liveCandidates
        .map(formatMetricCandidate)
        .filter(Boolean)
        .slice(0, 3);
    const dataChartCandidate = liveCandidates.find((candidate) => buildChartDataFromCandidate(candidate).length > 2);
    const chartData = dataChartCandidate ? buildChartDataFromCandidate(dataChartCandidate) : [];
    const layout = { span: 3, height: 320 };
    const widgets = [];
    if (metrics.length) {
        widgets.push({
            type: 'metric_card',
            title: 'Métricas clave del sensor activo',
            description: 'La vista se construye a partir de lecturas en vivo.',
            metrics,
            layout: { span: 2 }
        });
    }
    widgets.push({
        type: 'table',
        title: 'Sensores autorizados',
        description: 'Los sensores registrados para este usuario.',
        columns: ['Nombre', 'Tipo', 'Estado'],
        rows: buildTableRows(devices),
        layout: { span: 2 }
    });
    if (chartData.length) {
        widgets.push({
            type: 'line_chart',
            title: `${dataChartCandidate.name} · ${pickLiveKeyFromCandidate(dataChartCandidate)}`,
            description: 'Histórico corto de la lectura principal.',
            data: chartData,
            xLabel: 'Hora',
            yLabel: 'Valor',
            color: '#22c55e',
            layout,
            liveSource: dataChartCandidate && {
                sensorId: dataChartCandidate.sensorId,
                key: pickLiveKeyFromCandidate(dataChartCandidate),
                label: dataChartCandidate.name
            },
            liveWindow: 32
        });
    }
    if (!widgets.length) {
        widgets.push({
            type: 'metric_card',
            title: 'Lectura simulada',
            description: 'Se recomienda vincular sensores reales.',
            metrics: [
                { label: 'Generación solar', value: '42.5', unit: 'kW', trend: '+4.7%', accent: 'success' }
            ],
            layout: { span: 2 }
        });
    }
    return ensureLiveSources({
        title: 'Dashboard de microrredes (modo predeterminado)',
        description: `${promptText} · ${context}`,
        widgets
    }, liveCandidates, devices);
};

const extractResponseText = (response) => {
    if (!response) return '';
    return response.text || response.response || response.output_text || response.output?.text || '';
};

const generatePrompt = (userPrompt) =>
    (userPrompt && userPrompt.trim()) || 'Genera una vista principal que muestre métricas importantes y una tabla de sensores bajo control.';

const parserPromise = async (llm, promptText, context) => {
    if (!llm) {
        throw new Error('No se pudo inicializar el modelo LLM. Revisa las credenciales.');
    }

    const promptValue = await promptTemplate.formatPromptValue({
        format_instructions: formatInstructions,
        context,
        user_prompt: promptText
    });

    const response = await llm.invoke(promptValue);
    const text = extractResponseText(response);
    if (!text) {
        throw new Error('La respuesta del agente no contiene texto.');
    }
    return parser.parse(text);
};

const generateDashboardSpec = async ({ userId, userPrompt, extraContext, availableSensors = [] }) => {
    const promptText = generatePrompt(userPrompt);
    const normalizedFromArgs = normalizeDevices(availableSensors);
    const rawDevices = normalizedFromArgs.length
        ? normalizedFromArgs
        : userId ? await AuthorizedDevice.find({ userId }).lean() : [];
    const devices = normalizeDevices(rawDevices);
    const ids = devices.map((device) => device._id).filter(Boolean);
    const snapshots = await fetchLatestSnapshotsForSensors(ids, { limit: 12 });
    const context = buildContext(devices, extraContext);
    const liveCandidates = buildLiveSensorCandidates(devices, snapshots);
    const sensorContext = buildSensorContext(liveCandidates);
    const enrichedContext = [context, sensorContext].filter(Boolean).join('\n\n');

    const llm = createLLM();
    if (!llm) {
        return createFallbackSpec(promptText, enrichedContext, devices, liveCandidates);
    }

    const parsed = await parserPromise(llm, promptText, enrichedContext);
    return ensureLiveSources(parsed, liveCandidates, devices);
};

module.exports = {
    generateDashboardSpec
};
