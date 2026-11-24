import styled from 'styled-components';
import { trimVertical } from './typography';
import { gap, iconSize } from './tokens';

export const Icon = styled.span`
  display: block;
  width: ${({ $size }) => iconSize[$size]};
  height: ${({ $size }) => iconSize[$size]};
`;

export const Label = styled.span`
  ${trimVertical}
  display: block;
  height: 20px;
`;

export const Container = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: ${gap};

  & > ${Icon} {
    justify-self: start;
  }
`;
