# Remove the flags, move the QR below the years

## 1. No country flags
On the Staff Team join panel, the flag strip and the "+ your flag" label are removed entirely. The heading, the paragraph and the Contact us button stay exactly as they are, just with tighter spacing where the flags used to be.

## 2. Telegram QR moves to the bottom
On the committee home page the QR card leaves the header area. New order:

```text
badge + Arabic title + intro
admin buttons / Staff Team button
study plan banner
year grid (all years)
Telegram QR card
```

The card keeps everything it already does: tap the code or the Open Telegram button to reach the channel, and admins keep Upload / Edit link / Remove.

## Technical notes
- `src/components/committee/JoinTeamNote.tsx`: delete the flag list and its `flagcdn.com` images.
- `src/routes/committee.index.tsx`: move `<TelegramQrCard />` out of `<header>` and render it after the year grid, with top spacing.
