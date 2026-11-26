import { useAtomValue } from 'jotai'
import { viewAtom } from './store/player'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import HomeView from './components/HomeView'
import SearchView from './components/SearchView'
import LibraryView from './components/LibraryView'
import SettingsView from './components/SettingsView'
import { CollectionView, LikedView, PlaylistView } from './components/CollectionViews'
import ArtistView from './components/ArtistView'
import RightPanel from './components/RightPanel'
import Player from './components/Player'
import ContextMenu from './components/ContextMenu'
import Toast from './components/Toast'
import UpdateNotice from './components/UpdateNotice'

function Main() {
  const view = useAtomValue(viewAtom)
  switch (view.kind) {
    case 'home': return <HomeView />
    case 'search': return <SearchView />
    case 'library': return <LibraryView />
    case 'liked': return <LikedView />
    case 'settings': return <SettingsView />
    case 'playlist': return <PlaylistView id={view.id} />
    case 'collection': return <CollectionView key={view.id} id={view.id} />
    case 'artist': return <ArtistView key={view.id} id={view.id} />
  }
}

export default function App() {
  const view = useAtomValue(viewAtom)
  return (
    <div className="app-root flex flex-col h-screen text-zs-text overflow-hidden select-none">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden gap-2 px-2 pb-2">
        <Sidebar />
        <main key={JSON.stringify(view)} className="panel flex-1 overflow-y-auto scrollbar-thin">
          <Main />
        </main>
        <RightPanel />
      </div>
      <Player />
      <ContextMenu />
      <Toast />
      <UpdateNotice />
    </div>
  )
}
