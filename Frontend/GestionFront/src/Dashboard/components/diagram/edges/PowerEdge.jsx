import { memo } from 'react';
import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import { Zap } from 'lucide-react';
import { DEVICE_DEFINITIONS, CURRENT_TYPE } from '../constants/deviceTypes';

function PowerEdge({ id, sourceX, sourceY, targetX, targetY, source, target, style, data, selected }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const isInvalid = data?.isInvalid;
  const errorMessage = data?.errorMessage;

  const baseColor = isInvalid
    ? 'var(--destructive)'
    : data?.currentType === CURRENT_TYPE.AC
      ? '#f59e0b'
      : '#3b82f6';

  const baseStyle = {
    ...style,
    stroke: baseColor,
    strokeWidth: selected ? 2.5 : 1.8,
    strokeDasharray: data?.currentType === CURRENT_TYPE.AC ? 'none' : '6,3',
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={baseStyle} />
      <EdgeLabelRenderer>
        <div
          className="absolute pointer-events-none"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            className="drop-shadow-sm"
          >
            <circle cx="11" cy="11" r="10" fill="var(--card)" stroke={baseColor} strokeWidth="1.5" />
            <g transform="translate(11, 11)">
              <path
                d="M-3 -4 L3 0 L-3 4"
                fill="none"
                stroke={baseColor}
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </svg>
        </div>
        {isInvalid && errorMessage && (
          <div
            className="absolute pointer-events-none"
            style={{ transform: `translate(-50%, -120%) translate(${labelX}px,${labelY}px)` }}
          >
            <div className="bg-destructive text-destructive-foreground text-[10px] px-2 py-1 rounded-md shadow-md whitespace-nowrap font-medium">
              {errorMessage}
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {};

export const edgeTypes = { powerEdge: memo(PowerEdge) };
