const { z } = require('zod');

const outputSchema = z.object({
  estado_sistema: z.enum(['normal', 'advertencia', 'critico']),
  resumen_analisis: z.string().min(10).max(600),
  consejo_accionable: z.string().min(10).max(600),
  variable_graficada: z.string().optional(),
  datos_visualizacion: z.array(
    z.object({
      timestamp: z.string(),
      valor_real: z.number(),
      valor_esperado: z.number(),
    })
  ).min(0).max(60),
});

module.exports = { outputSchema };
