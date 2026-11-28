import { css } from '@linaria/core';

// auto-fill tracks of at least 200px: three columns on a wide screen, one on a phone.
const grid = css`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
