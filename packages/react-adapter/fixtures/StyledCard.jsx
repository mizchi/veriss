import styled, { css } from 'styled-components';

const gap = '8px';

const Title = styled.h2`
  margin: 0;
  font-size: 18px;
  height: 24px;
`;

const Body = styled.div`
  height: ${({ $open }) => ($open ? '120px' : '40px')};
`;

const Card = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: ${gap};
  padding: ${({ theme }) => theme.space.card};
  color: ${({ theme }) => theme.colors.text};
  ${({ $emphasis }) => $emphasis && css`
    border: 2px solid red;
  `}

  & > ${Title} {
    line-height: 1.4;
  }
`;

export default function StyledCard({ open, emphasis, title }) {
  return (
    <Card $emphasis={emphasis}>
      <Title>{title}</Title>
      <Body $open={open}>…</Body>
    </Card>
  );
}
