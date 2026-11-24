// className arrives through a rest spread
export default function Action({ children, ...rest }) {
  return <button type="button" {...rest}>{children}</button>;
}
