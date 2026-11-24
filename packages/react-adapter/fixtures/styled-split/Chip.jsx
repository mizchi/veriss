import * as Styled from './styled';
import { Label } from './styled';

export default function Chip({ large }) {
  return (
    <Styled.Container>
      <Styled.Icon $size={large ? 'large' : 'small'} />
      <Label>…</Label>
    </Styled.Container>
  );
}
