type Props = { href: string; label: string };

export default function MenuLink({ href, label }: Props) {
  return <a href={href}>{label}</a>;
}
