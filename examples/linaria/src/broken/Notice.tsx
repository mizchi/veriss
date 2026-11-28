import { css } from '@linaria/core';

// The nested rule below styles the notice from a class on some ancestor outside the component.
const notice = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding: 12px 16px;
  background: #fff8e1;
  color: #222;
  .theme-dark & {
    background: #3a2f00;
    color: #fff;
  }
`;
const text = css`
  margin: 0;
`;

export default function Notice() {
  return (
    <aside className={notice}>
      <p className={text}>Maintenance tonight</p>
    </aside>
  );
}
