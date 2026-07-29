# Unified Game Recommendation Flow Design

## Goal

Make the game recommendation page read as one continuous result rather than a
small featured block followed by a separate exploration tool.

## User Experience

After choosing conditions, the page keeps the existing featured recommendations
at the top. They retain their recommendation reasons, safe-rank numbers, and
special labels such as new, rising, or discovery.

Immediately below those cards, the page presents the exploration tabs:
`전체 추천`, `신작`, `지금 뜨는`, `숨은 게임`, and `클래식`. Selecting a tab
shows its 24-card page directly beneath the featured cards. The previous/next
controls remain below the exploration page.

The separate “더 많은 게임 찾아보기” visual section heading and its independent
container are removed. The result count moves beside the tabs, making the
featured cards and paginated results one recommendation flow while clearly
distinguishing the curated top picks from the complete tabbed list.

## State and Data

No recommendation or exploration data format changes. The featured index
continues to load at entry, and the compact exploration loader continues to
fetch only the selected query's rank/bitset/card shards. Changing conditions
resets the selected tab and exploration page as it does today.

## Accessibility and Testing

- Preserve the tablist semantics, loading/error/empty states, and accessible
  page navigation.
- Test that featured cards appear before the tabs and exploration cards inside
  one shared result region.
- Test that the removed standalone heading does not return.
- Preserve the existing 24-card DOM bound for exploration pages and the
  no-catalog-chunk request guarantee.
