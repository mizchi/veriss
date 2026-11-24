import styled from "styled-components";
import type { Size } from "./tokens";
import type { Tone } from "./types";

export const Container = styled.div<{ size: Size; tone: Tone }>`
  display: grid;
  padding: ${({ size }) => (size === "small" ? "8px" : "16px")};
  color: ${({ tone }) => (tone === "danger" ? "#c00" : "#036")};
`;
