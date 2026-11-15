import { useEffect, useRef } from "react";
import { TwistyPlayer } from "cubing/twisty";

type Props = { setup?: string; moves?: string; title: string };

export default function CubeView({ setup = "", moves = "", title }: Props) {
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwistyPlayer | null>(null);

  useEffect(() => {
    const player = new TwistyPlayer({
      puzzle: "3x3x3", visualization: "3D",
      background: "none", controlPanel: "none", backView: "none",
      experimentalSetupAlg: setup, alg: moves
    });
    playerRef.current = player;
    holderRef.current?.appendChild(player);
    player.jumpToEnd();
    return () => { player.remove(); playerRef.current = null; };
    // Create only once; following effect updates the existing instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    p.experimentalSetupAlg = setup;
    p.alg = moves;
    p.jumpToEnd();
  }, [setup, moves]);

  return <div className="cube-widget">
    <div className="cube-caption">{title}</div>
    <div className="cube-canvas" ref={holderRef} />
  </div>;
}
