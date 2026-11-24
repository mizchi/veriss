import { Danger, Primary } from './styled';

export default function Panel({ off }) {
  return (
    <section>
      <Danger disabled={off}>!</Danger>
      <Primary>Go</Primary>
    </section>
  );
}
