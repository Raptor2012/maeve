import type { ColorValue } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedCircle = withUniwind(Circle);

// Maeve fork: the orb's circle mark replaces T3's wordmark in branded builds.
export function T3Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  return (
    <Svg accessibilityLabel="Maeve" height={props.height} width={props.height} viewBox="0 0 60 60">
      <ThemedCircle
        cx={30}
        cy={30}
        r={26}
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
