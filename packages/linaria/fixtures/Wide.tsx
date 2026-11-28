import { css, cx } from '@linaria/core';

const page = css`display: grid; grid-template-columns: minmax(0, 1fr);`;
const bar = css`height: 40px;`;
const wide = css`width: 480px;`;

type Props = { compact: boolean };

export default function Wide({ compact }: Props) {
  return (
    <main className={page}>
      <div className={cx(bar, !compact && wide)} />
    </main>
  );
}
