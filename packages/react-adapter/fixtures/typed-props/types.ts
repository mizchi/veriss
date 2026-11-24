import type { Size } from "./tokens";
export type { Tone } from "./tokens";
import type { Tone } from "./tokens";

interface BaseProps {
  tone: Tone;
}

// an interface that extends another, one member typed by an imported alias, one optional with a default
export interface BannerProps extends BaseProps {
  size?: Size;
  message: string;
}

export type PillProps = BaseProps & { size: Size };
