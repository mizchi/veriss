import { css } from '@linaria/core';
import { styled } from '@linaria/react';

const page = css`display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px;`;
const Panel = styled.section`height: 120px; max-width: 100%;`;

export default function Card({ open }) {
  return (
    <main className={page}>
      {open && <Panel />}
    </main>
  );
}
