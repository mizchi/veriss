import { css } from '@linaria/core';

// The label is not tied to the field, and :global(body) resets the page from inside a component.
const form = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  :global(body) {
    margin: 0;
  }
`;
const field = css`
  display: block;
  height: 44px;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid #767676;
  font: inherit;
`;

export default function SearchForm() {
  return (
    <form className={form} role="search">
      <label>Search</label>
      <input className={field} type="search" name="q" />
    </form>
  );
}
