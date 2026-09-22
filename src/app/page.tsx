import CommunityPage from './community/page';

/** Discovery is the primary entry; /community remains a compatible deep link. */
export default function Home(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  return <CommunityPage searchParams={props.searchParams ?? Promise.resolve({})} />;
}
