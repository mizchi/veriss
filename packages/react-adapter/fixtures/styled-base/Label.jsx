import styled from 'styled-components';

const Wrap = styled.p`
  margin: 0;
  height: 20px;
`;

// className is passed on explicitly; disabled picks the markup
export default function Label({ className, disabled, children }) {
  return disabled ? (
    <Wrap className={className} aria-disabled="true">{children}</Wrap>
  ) : (
    <Wrap className={className}>{children}</Wrap>
  );
}
