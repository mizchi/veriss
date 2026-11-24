import styled from "styled-components";
import type { Size, Tone } from "./types";

export const Container = styled.div<{ size: Size; tone: Tone }>`
  display: grid;
  padding: ${({ size }) => (size === "small" ? "8px" : "16px")};
  color: ${({ tone }) => (tone === "danger" ? "#c00" : "#036")};
`;
