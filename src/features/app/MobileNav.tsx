type MobileNavProps = {
  isMobileDiscoverBrowseView: boolean
  isMobileLibraryView: boolean
  isMobileDiscoverSearchView: boolean
  openMobileDiscoverBrowseView: () => void
  openMobileLibraryView: () => void
  openMobileDiscoverSearchView: () => void
}

export function MobileNav({
  isMobileDiscoverBrowseView,
  isMobileLibraryView,
  isMobileDiscoverSearchView,
  openMobileDiscoverBrowseView,
  openMobileLibraryView,
  openMobileDiscoverSearchView,
}: MobileNavProps) {
  return (
    <nav className="pcMobileNav">
      <button
        className={`pcMobileNavItem ${isMobileDiscoverBrowseView ? 'active' : ''}`}
        onClick={openMobileDiscoverBrowseView}
      >
        <span className="material-symbols-outlined pcMobileNavItemIcon fill-1">
          explore
        </span>
        <span className="pcMobileNavItemLabel">Discover</span>
      </button>
      <button
        className={`pcMobileNavItem ${isMobileLibraryView ? 'active' : ''}`}
        onClick={openMobileLibraryView}
      >
        <span className="material-symbols-outlined pcMobileNavItemIcon">
          library_books
        </span>
        <span className="pcMobileNavItemLabel">Library</span>
      </button>
      <button
        className={`pcMobileNavItem ${isMobileDiscoverSearchView ? 'active' : ''}`}
        onClick={openMobileDiscoverSearchView}
      >
        <span className="material-symbols-outlined pcMobileNavItemIcon">
          search
        </span>
        <span className="pcMobileNavItemLabel">Search</span>
      </button>
    </nav>
  )
}
