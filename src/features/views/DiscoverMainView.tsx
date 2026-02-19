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
      <div className="pcSearchItemTitle pcSkeletonLine pcSkeletonScramble pcSkeletonW70">
        <ScrambleText
          text="SYNCING RESULT BUFFER"
          durationMs={700}
          delayMs={index * 45}
          loop
          loopDelayMs={130}
        />
      </div>
      <div className="pcSearchItemMeta">
        <span className="pcPill pcSkeletonLine pcSkeletonScramble pcSkeletonW30">
          <ScrambleText
            text="INDEXING"
            durationMs={620}
            delayMs={index * 45 + 70}
            loop
            loopDelayMs={120}
          />
        </span>
        <span className="pcPill pcSkeletonLine pcSkeletonScramble pcSkeletonW20">
          <ScrambleText
            text="RSS"
            durationMs={560}
            delayMs={index * 45 + 110}
            loop
            loopDelayMs={120}
          />
        </span>
      </div>
      <div className="pcMonoUrl pcSkeletonLine pcSkeletonScramble pcSkeletonW90">
        <ScrambleText
          text="HTTPS://FEED.NODE/LOADING"
          durationMs={760}
          delayMs={index * 45 + 150}
          loop
          loopDelayMs={140}
        />
      </div>
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
                <div className="pcDiscoverCardImage">
                  <span className="material-symbols-outlined pcDiscoverCardIcon">
                    memory
                  </span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Silicon Shadows</h4>
                <div className="pcDiscoverCardMeta">
                  <span className="pcDiscoverCardSubtitle">/// SECURE_FEED_01</span>
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
                <div className="pcDiscoverCardImage">
                  <span className="material-symbols-outlined pcDiscoverCardIcon">
                    wifi_off
                  </span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Signal Loss</h4>
                <div className="pcDiscoverCardMeta">
                  <span className="pcDiscoverCardSubtitle">/// BAND_77-ALPHA</span>
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
                <div className="pcDiscoverCardImage">
                  <span className="material-symbols-outlined pcDiscoverCardIcon">
                    graphic_eq
                  </span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Cybernetic Echo</h4>
                <div className="pcDiscoverCardMeta">
                  <span className="pcDiscoverCardSubtitle">
                    /// RECURSIVE_DYNAMICS
                  </span>
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
                <div className="pcDiscoverCardImage">
                  <span className="material-symbols-outlined pcDiscoverCardIcon">
                    code
                  </span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Black Box Logic</h4>
                <div className="pcDiscoverCardMeta">
                  <span className="pcDiscoverCardSubtitle">/// OPAQUE_ANALYSIS</span>
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
                <div className="pcDiscoverCardImage">
                  <span className="material-symbols-outlined pcDiscoverCardIcon">
                    radio_button_unchecked
                  </span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">The Void State</h4>
                <div className="pcDiscoverCardMeta">
                  <span className="pcDiscoverCardSubtitle">/// NULL_POINTER</span>
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
                <div className="pcDiscoverCardImage">
                  <span className="material-symbols-outlined pcDiscoverCardIcon">
                    hub
                  </span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Proxy War</h4>
                <div className="pcDiscoverCardMeta">
                  <span className="pcDiscoverCardSubtitle">/// NODE_LATENCY_24</span>
                  <span className="pcDiscoverCardStat">New Today</span>
                </div>
              </div>
            </div>
            <div className="pcDiscoverCard">
              <div className="pcDiscoverCardImageContainer">
                <div className="pcDiscoverCardImage">
                  <span className="material-symbols-outlined pcDiscoverCardIcon">
                    lan
                  </span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Gridlock Theory</h4>
                <div className="pcDiscoverCardMeta">
                  <span className="pcDiscoverCardSubtitle">
                    /// TRAFFIC_REDACTED
                  </span>
                  <span className="pcDiscoverCardStat">New Today</span>
                </div>
              </div>
            </div>
            <div className="pcDiscoverCard">
              <div className="pcDiscoverCardImageContainer">
                <div className="pcDiscoverCardImage">
                  <span className="material-symbols-outlined pcDiscoverCardIcon">
                    dns
                  </span>
                </div>
              </div>
              <div className="pcDiscoverCardContent">
                <h4 className="pcDiscoverCardTitle">Mainframe Memoirs</h4>
                <div className="pcDiscoverCardMeta">
                  <span className="pcDiscoverCardSubtitle">/// COBOL_HERITAGE</span>
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
