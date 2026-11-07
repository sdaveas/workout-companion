import type { MotionPattern } from '../../data/exercises';

/**
 * A deliberately simple side-view figure. Each movement pattern swings one joint
 * (or sinks the body) on a loop; the rest of the figure stays put. Pure inline SVG
 * plus CSS keyframes, so it ships offline and costs a few hundred bytes.
 * Decorative: the exercise name is always on screen as text.
 */
export function ExerciseMotion({ pattern }: { pattern: MotionPattern | null }) {
  return (
    <div
      aria-hidden
      className="flex h-40 w-full items-center justify-center rounded-2xl border border-line bg-surface text-muted"
    >
      <svg
        viewBox="26 26 128 130"
        className="h-40 w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="24" y1="150" x2="216" y2="150" strokeWidth={2} opacity={0.35} />
        {figure(pattern)}
      </svg>
    </div>
  );
}

const Head = ({ x, y }: { x: number; y: number }) => (
  <circle cx={x} cy={y} r={12} fill="currentColor" stroke="none" />
);

const legs = (
  <>
    <path d="M70 100 L60 150" />
    <path d="M70 100 L84 150" />
  </>
);

const dumbbell = (x: number, y: number) => (
  <path d={`M${x} ${y - 8} v16`} strokeWidth={7} />
);

function figure(pattern: MotionPattern | null) {
  switch (pattern) {
    case 'push':
      return (
        <>
          <Head x={58} y={44} />
          <path d="M62 58 L70 100" />
          {legs}
          <g className="m-swing m-push" style={{ transformOrigin: '68px 62px' }}>
            <path d="M68 62 L104 62" />
            {dumbbell(104, 62)}
          </g>
        </>
      );
    case 'pull':
      return (
        <>
          <Head x={58} y={44} />
          <path d="M62 58 L70 100" />
          {legs}
          <g className="m-swing m-pull" style={{ transformOrigin: '68px 62px' }}>
            <path d="M68 62 L108 62" />
            {dumbbell(108, 62)}
          </g>
        </>
      );
    case 'curl':
      return (
        <>
          <Head x={58} y={44} />
          <path d="M62 58 L70 100" />
          {legs}
          <path d="M68 62 L68 96" />
          <g className="m-swing m-curl" style={{ transformOrigin: '68px 96px' }}>
            <path d="M68 96 L68 128" />
            {dumbbell(68, 132)}
          </g>
        </>
      );
    case 'raise':
      return (
        <>
          <Head x={58} y={44} />
          <path d="M62 58 L70 100" />
          {legs}
          <g className="m-swing m-raise" style={{ transformOrigin: '68px 62px' }}>
            <path d="M68 62 L68 108" />
            {dumbbell(68, 112)}
          </g>
        </>
      );
    case 'squat':
      return (
        <>
          <g className="m-swing m-thigh" style={{ transformOrigin: '70px 100px' }}>
            <path d="M70 100 L78 124" />
          </g>
          <g className="m-swing m-shin" style={{ transformOrigin: '78px 124px' }}>
            <path d="M78 124 L78 150" />
          </g>
          <g className="m-swing m-squat" style={{ transformOrigin: '70px 100px' }}>
            <Head x={58} y={44} />
            <path d="M62 58 L70 100" />
            <path d="M66 64 L92 78" />
          </g>
        </>
      );
    case 'hinge':
      return (
        <>
          <g className="m-swing m-hinge" style={{ transformOrigin: '70px 100px' }}>
            <Head x={58} y={44} />
            <path d="M62 58 L70 100" />
            <path d="M66 66 L80 104" />
            {dumbbell(80, 108)}
          </g>
          {legs}
        </>
      );
    case 'core':
      return (
        <g className="m-swing m-core" style={{ transformOrigin: '90px 120px' }}>
          <Head x={52} y={104} />
          <path d="M64 110 L150 128" />
          <path d="M150 128 L170 150" />
          <path d="M84 114 L84 150" />
          <path d="M84 150 L100 150" />
        </g>
      );
    default:
      return (
        <g className="m-swing m-idle" style={{ transformOrigin: '120px 80px' }}>
          <path d="M92 82 h56" strokeWidth={7} />
          <path d="M92 72 v20" strokeWidth={6} />
          <path d="M148 72 v20" strokeWidth={6} />
        </g>
      );
  }
}
