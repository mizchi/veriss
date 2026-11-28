import { css } from '@linaria/core';

// htmlFor/id ties the label to the field; the page's margin belongs to the page CSS (--page-css), not to a component.
const form = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
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
      <label htmlFor="search-q">Search</label>
      <input className={field} id="search-q" type="search" name="q" />
    </form>
  );
}
