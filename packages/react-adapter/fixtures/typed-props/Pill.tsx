import * as React from "react";
import * as Styled from "./styled";
import type { PillProps } from "./types";

const Pill: React.FC<PillProps> = ({ tone, size }) => <Styled.Container size={size} tone={tone}>pill</Styled.Container>;

export default Pill;
