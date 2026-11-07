import type { MotionPattern } from '../../data/exercises';

/**
 * Side-view figures: one joint moves on a loop, the rest of the body holds still.
 * Drawn to a 240×160 viewBox, pure inline SVG plus CSS keyframes, so they ship
 * offline. Decorative: the exercise name is always on screen as text.
 */
export function ExerciseMotion({ pattern }: { pattern: MotionPattern | null }) {
  return (
    <div
      aria-hidden
      className="flex h-40 w-full items-center justify-center rounded-2xl border border-line bg-surface text-muted"
    >
      <svg
        viewBox="0 0 240 160"
        className="h-40 w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="150" x2="228" y2="150" strokeWidth={2} opacity={0.3} />
        {figure(pattern)}
      </svg>
    </div>
  );
}

const Head = ({ x, y }: { x: number; y: number }) => (
  <circle cx={x} cy={y} r={12} fill="currentColor" stroke="none" />
);

/** Dumbbell centred on a hand, drawn as a bar with a plate at each end. */
const Dumbbell = ({ x, y }: { x: number; y: number }) => (
  <>
    <path d={`M${x - 13} ${y} H${x + 13}`} strokeWidth={4} />
    <path d={`M${x - 13} ${y - 6} V${y + 6} M${x + 13} ${y - 6} V${y + 6}`} />
  </>
);

function figure(pattern: MotionPattern | null) {
  switch (pattern) {
    // Lying on a bench, pressing a bar up and down.
    case 'push':
      return (
        <>
          <rect
            x="48"
            y="110"
            width="145"
            height="7"
            rx="2"
            fill="currentColor"
            fillOpacity={0.12}
            strokeWidth={2}
          />
          <path d="M65 117 V150 M180 117 V150" />
          <path d="M83 105 L145 105" />
          <path d="M145 105 L172 125 L200 143" />
          <path d="M172 125 L190 145" />
          <path d="M83 105 L65 105" />
          <Head x={65} y={105} />
          <g className="m-swing m-press-arm" style={{ transformOrigin: '130px 99px' }}>
            <path d="M130 99 L126 76 L126 57" />
            <path d="M139 99 L144 76 L144 57" />
          </g>
          <g className="m-swing m-press-bar">
            <path d="M111 55 H159" />
            <path d="M112 47 V63 M158 47 V63" />
            <path d="M105 47 V63 M165 47 V63" />
          </g>
        </>
      );

    // Bent over, pulling a dumbbell up to the ribs.
    case 'pull':
      return (
        <>
          <Head x={158} y={34} />
          <path d="M149 43 L116 77" />
          <path d="M116 77 L91 112" />
          <path d="M91 112 L78 146" />
          <path d="M116 77 L132 112 L147 146" />
          <path d="M116 77 L137 65 L153 68" />
          <path d="M116 77 L91 103 L81 127" />
          <g className="m-swing m-row-arm" style={{ transformOrigin: '125px 70px' }}>
            <path d="M125 70 L107 91 L93 112" />
            <path d="M93 112 L91 137 L79 137" />
            <Dumbbell x={89} y={137} />
          </g>
        </>
      );

    // Standing, hips sinking while the torso stays upright.
    case 'squat':
      return (
        <>
          <g className="m-swing m-squat-body" style={{ transformOrigin: '115px 72px' }}>
            <Head x={115} y={30} />
            <path d="M115 42 L115 88" />
            <path d="M115 56 L90 75 L75 65" />
            <path d="M115 56 L140 75 L155 65" />
            <path d="M115 88 L94 112 L80 146" />
            <path d="M115 88 L139 112 L155 146" />
          </g>
          <g className="m-swing m-squat-legs" style={{ transformOrigin: '115px 108px' }}>
            <path d="M94 112 L115 125 L115 146" />
            <path d="M139 112 L130 130 L155 146" />
          </g>
        </>
      );

    // Hinging at the hip with a barbell, knees easing forward.
    case 'hinge':
      return (
        <>
          <g className="m-swing m-dead-legs" style={{ transformOrigin: '115px 108px' }}>
            <path d="M115 83 L92 111 L82 146" />
            <path d="M115 83 L139 111 L151 146" />
          </g>
          <g className="m-swing m-dead-torso" style={{ transformOrigin: '115px 83px' }}>
            <Head x={115} y={30} />
            <path d="M115 42 L115 83" />
            <path d="M115 56 L92 75 L82 102" />
            <path d="M115 56 L138 75 L148 102" />
          </g>
          <g className="m-swing m-dead-bar">
            <path d="M65 116 H175" />
            <path d="M70 106 V126 M80 106 V126 M160 106 V126 M170 106 V126" />
          </g>
        </>
      );

    // Standing, forearm swinging up around the elbow.
    case 'curl':
      return (
        <>
          <Head x={115} y={30} />
          <path d="M115 42 V96" />
          <path d="M115 54 L91 72 L91 105" />
          <path d="M115 54 L140 72" />
          <path d="M115 96 L96 119 L96 146" />
          <path d="M115 96 L135 119 L135 146" />
          <g className="m-swing m-curl-forearm" style={{ transformOrigin: '140px 72px' }}>
            <path d="M140 72 L140 105 L140 128" />
            <Dumbbell x={140} y={130} />
          </g>
        </>
      );

    // Standing, straight arm lifting out to the side.
    case 'raise':
      return (
        <>
          <Head x={115} y={30} />
          <path d="M115 42 V96" />
          <path d="M115 54 L93 70 L93 100" />
          <path d="M115 96 L96 119 L96 146" />
          <path d="M115 96 L135 119 L135 146" />
          <g className="m-swing m-raise-arm" style={{ transformOrigin: '115px 54px' }}>
            <path d="M115 54 L115 98" />
            <Dumbbell x={115} y={100} />
          </g>
        </>
      );

    // Forearm plank, breathing so it is visibly alive.
    case 'core':
      return (
        <g className="m-swing m-plank">
          <Head x={198} y={89} />
          <path d="M185 91 L125 91 L79 105 L42 137" />
          <path d="M125 91 L144 119 L144 143" />
          <path d="M144 143 L158 143" />
          <path d="M79 105 L61 127 L42 137" />
          <path d="M42 137 L28 137" />
          <path d="M125 91 L105 110 L95 137" />
          <path d="M95 137 L108 137" />
        </g>
      );

    default:
      return (
        <g className="m-swing m-idle">
          <path d="M92 72 H148" strokeWidth={6} />
          <path d="M92 62 V82 M148 62 V82" />
        </g>
      );
  }
}
