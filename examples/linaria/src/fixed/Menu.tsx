import { styled } from '@linaria/react';
import MenuLink from './MenuLink';

// The list styles only its own elements; the link's padding is in MenuLink.
const List = styled.ul`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
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
