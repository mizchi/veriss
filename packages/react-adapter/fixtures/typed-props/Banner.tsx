import * as React from "react";
import * as Styled from "./styled";
import { BannerProps } from "./types";

const Banner = React.forwardRef<HTMLDivElement, BannerProps>(function Banner({ tone, size = "medium", message }, ref) {
  return (
    <Styled.Container ref={ref} size={size} tone={tone}>
      {message}
    </Styled.Container>
  );
});

export default Banner;
