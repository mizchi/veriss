import { css } from '@linaria/core';

// Three fixed 200px columns: 600px plus gaps, wider than a phone.
const grid = css`
  display: grid;
  grid-template-columns: repeat(3, 200px);
  gap: 16px;
`;
const plan = css`
  height: 160px;
  padding: 16px;
  background: #f4f4f4;
`;

export default function PricingGrid() {
  return (
    <section className={grid}>
      <div className={plan} />
      <div className={plan} />
      <div className={plan} />
    </section>
  );
}
