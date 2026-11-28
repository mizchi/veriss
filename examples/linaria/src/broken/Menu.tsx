import { styled } from '@linaria/react';
import MenuLink from './MenuLink';

// `& a` styles the <a> that <MenuLink> renders: the style lives in the wrong component.
const List = styled.ul`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
  & a {
    display: block;
    padding: 8px 12px;
  }
`;

type Props = { items: string[] };

export default function Menu({ items }: Props) {
  return (
    <nav aria-label="Sections">
      <List role="list">
        {items.map(label => <li key={label}><MenuLink href={`#${label}`} label={label} /></li>)}
      </List>
    </nav>
  );
}
