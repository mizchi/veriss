import { css, cx } from '@linaria/core';

// The theme is a prop: `dark && darkNotice` is a state of this component, and the checker checks both.
const notice = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding: 12px 16px;
  background: #fff8e1;
  color: #222;
`;
const darkNotice = css`
  background: #3a2f00;
  color: #fff;
`;
const text = css`
  margin: 0;
`;

type Props = { dark?: boolean };

export default function Notice({ dark }: Props) {
  return (
    <aside className={cx(notice, dark && darkNotice)}>
      <p className={text}>Maintenance tonight</p>
    </aside>
  );
}
