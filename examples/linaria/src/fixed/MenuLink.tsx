import { css } from '@linaria/core';

const link = css`
  display: block;
  padding: 8px 12px;
  color: #0b57d0;
`;

type Props = { href: string; label: string };

export default function MenuLink({ href, label }: Props) {
  return <a className={link} href={href}>{label}</a>;
}
