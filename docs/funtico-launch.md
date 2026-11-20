# Funtico: decisions and open questions

Parked until launch. Nothing here is settled by code.

## Settled

- Fees, prize pools and distribution come from Funtico's backoffice. We do not set a split
  and do not keep a remainder of an entry fee.
- Rooms take 10% commission plus 10% to the PLAYR Jar. 20% of every entry leaves before prizes.
- Room tiers: Free, Contender (250 tokens), Challenger (1250), Champion (2500).
- Vouchers are earned: 10 rooms of the same type, in any Funtico game, then one free entry.
- The studio's revenue is a separate agreement with Funtico, sponsorship, or paid content.
- Prize distribution runs automatically after multifactor and cheater checks, so results can
  be pending and the interface must show that state.

## Questions to Funtico before launch

1. A two-player room at contender level: what does the winner receive, and the runner-up?
   Is a two-player PvP room with an external match id supported at all four tiers?
2. "100 playr/entry" in tournaments: is that 100 players or a 100-token entry fee? Is the
   prize pool guaranteed or a share of what is collected?
3. Do we earn anything from paid rooms, or is the studio deal entirely separate? If separate,
   what is the standard shape of that deal?
4. The PLAYR Jar: how does it pay out, and is it visible per room?
5. Can we create our own room tiers, or is the set fixed at the four above?
6. Ties and leavers: who decides, the backoffice or our server, when two players finish equal
   or one never arrives?

## Design reference

The Funtico UI kit at https://funtico-game-ui-kit.pages.dev/ is unreachable from this machine
(connection reset, and absent from the Wayback Machine). Ask for screenshots or a zip.
