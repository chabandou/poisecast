import { memo, type CSSProperties, type MutableRefObject } from 'react'
import type { ApplePodcastResult } from '../../podcasts/appleSearch'
import { GlitchImage } from '../../ui/GlitchImage'
import { SearchResults } from '../feeds/SearchResults'
import { ScrambleText } from '../system/ScrambleText'

export type DiscoverMainViewProps = {
  isVisible: boolean
  discoverSearchInputRef: MutableRefObject<HTMLInputElement | null>
  searchTerm: string
  setSearchTerm: (next: string) => void
  hasSearchQuery: boolean
  searchLoading: boolean
  searchError: string | null
  searchResults: ApplePodcastResult[]
  rssLoading: boolean
  loadingFeedUrl: string | null
  onSelectSearchResult: (result: ApplePodcastResult) => void
  searchQuery: string
}

export const DiscoverMainView = memo(function DiscoverMainView({
  isVisible,
  discoverSearchInputRef,
  searchTerm,
  setSearchTerm,
  hasSearchQuery,
  searchLoading,
  searchError,
  searchResults,
  rssLoading,
  loadingFeedUrl,
  onSelectSearchResult,
  searchQuery,
}: DiscoverMainViewProps) {
  if (!isVisible) return null

  const loadingSkeletonCards = Array.from({ length: 5 }, (_, index) => (
    <div
      key={`discover-skeleton-${index}`}
      className="pcSearchItem pcSearchItemSkeleton pcChamfer pcStaggerItem"
      style={
        {
          '--pc-stagger-index': `${index}`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <div className="pcSearchItemTitle pcSkeletonLine pcSkeletonW70" />
      <div className="pcSearchItemMeta">
        <span className="pcPill pcSkeletonLine pcSkeletonW30" />
        <span className="pcPill pcSkeletonLine pcSkeletonW20" />
      </div>
      <div className="pcMonoUrl pcSkeletonLine pcSkeletonW90" />
    </div>
  ))

  return (
    <div className="pcDiscoverScreen pcViewSurface pcViewSurfaceDiscover">
      <div className="pcDiscoverSearch">
        <div className="pcDiscoverSearchInner">
          <span className="material-symbols-outlined pcDiscoverSearchIcon">
            search
          </span>
          <input
            ref={discoverSearchInputRef}
            className="pcDiscoverSearchInput"
            placeholder="SEARCH ARCHIVE..."
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {hasSearchQuery ? (
        <div className="pcDiscoverContent">
          {searchLoading ? (
            <div className="pcSearchResults pcStaggerList">
              {loadingSkeletonCards}
            </div>
          ) : null}
          {searchError ? (
            <div className="pcInlineError">{searchError}</div>
          ) : null}
          {!searchLoading && !searchError ? (
            <SearchResults
              results={searchResults}
              rssLoading={rssLoading}
              loadingFeedUrl={loadingFeedUrl}
              onSelect={onSelectSearchResult}
            />
          ) : null}
          {!searchLoading && !searchError && searchResults.length === 0 ? (
            <div className="pcEmpty">No shows found for "{searchQuery}".</div>
          ) : null}
        </div>
      ) : null}

      <div className="pcDiscoverHero">
        <GlitchImage
          variant="hero"
          className="pcDiscoverHeroImage"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDzeTSV-6dtbtX3Z3gEnqx1ny2MdjhrnEdQ5DYGWbbUdO6M8oL3FeItZiyC8XbRKZ_aPzrp3qK4gpNljWbCEG9OLc-A6L7RpIJeI8hKnow1_8Dbe3EeREKpy-VObVYI47YVsun6ApHvX173U3CrqNlbZCBU3lFzXEanuVr5oF9grbWVZGb9fHnVXHG7ArOFqAAdbtvlE1c1I7TObE5Z12oOp07yoFFBMCvhSfQuObLStUBRxUzQm4q2iXMLPVrsgKj6N8fGmWdHICc"
          alt="Hero Banner"
        />
        <div className="pcDiscoverHeroOverlay">
          <div className="pcDiscoverHeroContent">
            <div className="pcDiscoverHeroHeader">
              <span className="pcDiscoverHeroBadge">
                <ScrambleText text="Featured Intel" durationMs={820} />
              </span>
              <span className="pcDiscoverHeroPriority">
                <ScrambleText
                  text="/// PRIORITY_STREAM: 098"
                  durationMs={850}
                  delayMs={80}
                />
              </span>
            </div>
            <h2 className="pcDiscoverHeroTitle">
              <ScrambleText text="NEURAL" durationMs={900} />{' '}
              <span className="pcDiscoverHeroTitleAccent">
                <ScrambleText text="OVERRIDE" durationMs={900} delayMs={120} />
              </span>
            </h2>
            <p className="pcDiscoverHeroDesc">
              Exploring the ethics of cognitive enhancement and the impending
              singularity. A deep dive into the industrial-scale deployment of
              wetware interfaces.
            </p>
            <div className="pcDiscoverHeroActions">
              <button className="pcDiscoverHeroBtn">
                <span className="material-symbols-outlined FILL-1">
                  play_arrow
                </span>
                <span>LISTEN NOW</span>
              </button>
              <button className="pcDiscoverHeroBtnSecondary">
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pcDiscoverContent">
        <div className="pcDiscoverSection">
          <div className="pcDiscoverSectionHeader">
            <div className="pcDiscoverSectionTitle">
              <span>
                <ScrambleText text="Trending Data" durationMs={760} />
              </span>
              <span className="pcDiscoverSectionLive">LIVE_TRAFFIC</span>
            </div>
            <button className="pcDiscoverSectionBtn">View All ///</button>
          </div>
          <div className="pcDiscoverGrid">
            <div className="pcDiscoverCard">
              <div className="pcDiscoverCardImageContainer">
                <GlitchImage
                  variant="card"
                  className="pcDiscoverCardImage"
                  wrapperClassName="pcGlitchImage--outsideFx"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDtzK1iqz5noL89la9IeFHfnFxxvlD3O4zDlwXFTNGS4XpFPJJBCIdNHocLSVUjijuVwPhxZi3W3g1n9ASgnnBvlKwVDN4QixR7DOE07PIOMjQFAJB6RO29gdjOh6TQb9OwepomkGTRyM58I65RzbFWCjs5-NcgaRz8EBt3N8bwPPndkPuaWZjQRZLtZyIQ0Bj1qenBwIj0fHdAbp1iDlLCWARd0ZfXjAePcIVhIZ9AFA-Hj-9IEnt4NBhRjuIjFbTBThKDV1zfmO8"
                  alt="Cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
                <div className="pcDiscoverCardOverlay">
                  <span className="material-symbols-outlined">play_circle</span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Silicon Shadows</h4>
                <div className="pcDiscoverCardMeta">
                  <span>/// SECURE_FEED_01</span>
                  <span className="pcDiscoverCardStats">
                    <span className="pcDiscoverCardStat">8.4k Listeners</span>
                    <span className="pcDiscoverCardSeparator">|</span>
                    <span className="pcDiscoverCardTime">42m</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="pcDiscoverCard">
              <div className="pcDiscoverCardImageContainer">
                <GlitchImage
                  variant="card"
                  className="pcDiscoverCardImage"
                  wrapperClassName="pcGlitchImage--outsideFx"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuD9MmU9rF06s7UoRz6GYPQg8sB6osarAIGvhGB_kKiHKS6w7SYWpW6D43cK7s7RWyCTJJvGWc696VYkXoqnIOpc9LCOGEfYXnP1n93KcwMOAGzFi0UymL80UJKBbyWYJrUDyYtfME2ACMGyNHa0S3cyt0XIQtOXuMDUeRxQeQTF7QsmyqoAE6JDoSxOfk3BXmUKuq7RaqYTdyBIq7y_qV4b_4DXPrSHQhd1HEbPt1_2hQvO497scg2_tgOjUvgmEm9P9-9n1PXisT0"
                  alt="Cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
                <div className="pcDiscoverCardOverlay">
                  <span className="material-symbols-outlined">play_circle</span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Signal Loss</h4>
                <div className="pcDiscoverCardMeta">
                  <span>/// BAND_77-ALPHA</span>
                  <span className="pcDiscoverCardStats">
                    <span className="pcDiscoverCardStat">3.2k Listeners</span>
                    <span className="pcDiscoverCardSeparator">|</span>
                    <span className="pcDiscoverCardTime">1h 05m</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="pcDiscoverCard">
              <div className="pcDiscoverCardImageContainer">
                <GlitchImage
                  variant="card"
                  className="pcDiscoverCardImage"
                  wrapperClassName="pcGlitchImage--outsideFx"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCsZvyo4Znm9_Zf6sBmSL-JM5q8iNgKeiBGmd2JIrRdVVm8YnNm3TE2A40SHbp4tXarOZkawNiJDDxvCPDs8VXk1sCpSdxXv8AmOJMGUiz1ToyKV0BpPJD1cHsRyzwd-agPUQiyxTWNHW5bwVFhpS19_aYYE2-wGlW3aqMgiDe-YNCxPwWLzuUOqWLfYemSLpmUTaehRBg3NEgmn1UCVBDcVW1W-58nS-karXJzefpt7eZK_pyUTJ9kBIQphPQiKfc1XKT9ajvqaWg"
                  alt="Cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
                <div className="pcDiscoverCardOverlay">
                  <span className="material-symbols-outlined">play_circle</span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Cybernetic Echo</h4>
                <div className="pcDiscoverCardMeta">
                  <span>/// RECURSIVE_DYNAMICS</span>
                  <span className="pcDiscoverCardStats">
                    <span className="pcDiscoverCardStat">12k Listeners</span>
                    <span className="pcDiscoverCardSeparator">|</span>
                    <span className="pcDiscoverCardTime">38m</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="pcDiscoverCard">
              <div className="pcDiscoverCardImageContainer">
                <GlitchImage
                  variant="card"
                  className="pcDiscoverCardImage"
                  wrapperClassName="pcGlitchImage--outsideFx"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzDIVsR1QW9UcG-2LSKPS05pNQ9KDbhy06hjgLOnDz-tRsInoh4OvHaWoRpgvb4axqbIzHx0Jurrx9T8XT66FAAzE2BNBBN41Fd49WgPitMLcWiW61H7oKy9QyEeAZkJKVfNOdS_JvlyFP0yfFTAu0JuqbuNE5ee4xEC-UPq3qvfxj-XL7-2FWMQcNR_bcmUBBZ9WWdIlTG6t2EBKeYjRO8k-VDlmbe_R3rva4RP_AWsjA-nsDjS_7bGKJLQ1a6zzD_CoKW-FXVVo"
                  alt="Cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
                <div className="pcDiscoverCardOverlay">
                  <span className="material-symbols-outlined">play_circle</span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Black Box Logic</h4>
                <div className="pcDiscoverCardMeta">
                  <span>/// OPAQUE_ANALYSIS</span>
                  <span className="pcDiscoverCardStats">
                    <span className="pcDiscoverCardStat">1.1k Listeners</span>
                    <span className="pcDiscoverCardSeparator">|</span>
                    <span className="pcDiscoverCardTime">55m</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="pcDiscoverCard">
              <div className="pcDiscoverCardImageContainer">
                <GlitchImage
                  variant="card"
                  className="pcDiscoverCardImage"
                  wrapperClassName="pcGlitchImage--outsideFx"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAixwBoGqTYegjsHEcErjMm2FwUPiygGKcp2xDRqtRLmdqkbbee9X1RAougWqdI4f7OZsWzXuNqhl_TlgcvVH1qSQcJd_exGMLeWDrCnUT57aL5J-oLdKfxWWyd_12IGh_62FtLz1SUgVhIL2XMCI9z8jFNqrGLHrXrLthAH86eDJ_rU97uMHTzCLU4oNb56tA-gsuZm1ZKFNmyDGFhxdxt-PVXgPY2-WLB9NsNkAtRF5QDf-IRNnHB5Pevu45z0XO2iNIpK8xMV-0"
                  alt="Cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
                <div className="pcDiscoverCardOverlay">
                  <span className="material-symbols-outlined">play_circle</span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">The Void State</h4>
                <div className="pcDiscoverCardMeta">
                  <span>/// NULL_POINTER</span>
                  <span className="pcDiscoverCardStats">
                    <span className="pcDiscoverCardStat">6.7k Listeners</span>
                    <span className="pcDiscoverCardSeparator">|</span>
                    <span className="pcDiscoverCardTime">29m</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pcDiscoverSection">
          <div className="pcDiscoverSectionHeader">
            <div className="pcDiscoverSectionTitle">
              <span>
                <ScrambleText
                  text="New Signals"
                  durationMs={760}
                  delayMs={60}
                />
              </span>
              <span className="pcDiscoverSectionTag">RECENT_UPLINK</span>
            </div>
            <button className="pcDiscoverSectionBtn">Incoming ///</button>
          </div>
          <div className="pcDiscoverGrid">
            <div className="pcDiscoverCard">
              <div className="pcDiscoverCardImageContainer">
                <GlitchImage
                  variant="card"
                  className="pcDiscoverCardImage"
                  wrapperClassName="pcGlitchImage--outsideFx"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBQ3sDWhcCWQGb0eVMWJlmK9ijOLa2MdeshHnMRTZv9DVVGhTfsL_NhxeOvBEkfa7GJddmc_94NPrT0ZuTw4CUj2ghtMGsNbfjiKd5VEU972MpUZvjZlokGEqvO_SvRr1h9SJiXOZmljs6nO26TOapswvXFHsp67DkzqFHm61JBJGOILhjRlO4THW3rEiTEC1N7Cn9vHvnpWSGQzWuyH9gbxM1OKq5E9Yftq0Eo9xoK4iOXZvO5F-Df7VQfcvOF0bWQOO4byL6l9yM"
                  alt="Cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Proxy War</h4>
                <div className="pcDiscoverCardMeta">
                  <span>/// NODE_LATENCY_24</span>
                  <span className="pcDiscoverCardStat">New Today</span>
                </div>
              </div>
            </div>
            <div className="pcDiscoverCard">
              <div className="pcDiscoverCardImageContainer">
                <GlitchImage
                  variant="card"
                  className="pcDiscoverCardImage"
                  wrapperClassName="pcGlitchImage--outsideFx"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDa4iugeL8djUHWo-wL-yd0IDgeTkC7ZsKP3-N_OrOGQojYCCDGK1MifY6dLEZwJePbpbGCpnC7rzo4ikiZzpOZEwTVho0u2Hq4Q7-qVY6VrpQ_bf53GDsVyy54ZU4o6GN7yOrKeDkEjadyoEGjGYkSeTVZhZ4yMSu6EjlrpISgPudbZMFHsNHkdEjH9Ap3I2xpzJqleDYo1nRJUWec9WnQSdGS6bHB1CWP3n3LKtrAvdTuA6zV4XCqrHy5Ongr4ka39SZi4qSk-r4"
                  alt="Cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Gridlock Theory</h4>
                <div className="pcDiscoverCardMeta">
                  <span>/// TRAFFIC_REDACTED</span>
                  <span className="pcDiscoverCardStat">New Today</span>
                </div>
              </div>
            </div>
            <div className="pcDiscoverCard">
              <div className="pcDiscoverCardImageContainer">
                <GlitchImage
                  variant="card"
                  className="pcDiscoverCardImage"
                  wrapperClassName="pcGlitchImage--outsideFx"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAdR42crqA2ZUK0rzvsRKIeGKdU4eOdVt9UltmZaQsz0UfqzMrqIeaDbUyNX2CvQ09mKD-dtcraA3I7lt6oLerJOGTSw8dlRkzTK9OpncSfStF_dQGK8e61BiVnKQDDOXOmmmnnU2h7aZ-j0zg78Fjz_2SECFeKreRvtM5N3XPtABYG7CvxPO3ni_6FOXbFoII6sOs2K7laHf9toEMQfwomMmnzR-YDLth8m-aQQvnhoiLoEjRElqaU7IsHaJAnPLrb13vf5uwTts4"
                  alt="Cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Mainframe Memoirs</h4>
                <div className="pcDiscoverCardMeta">
                  <span>/// COBOL_HERITAGE</span>
                  <span className="pcDiscoverCardStat">2h ago</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
