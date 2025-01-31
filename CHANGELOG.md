# Changelog

# 3.0.1

### Upgrade steps

Update `BackingManager`, both `RevenueTraders` (rTokenTrader/rsrTrader), and call `Broker.setBatchTradeImplementation()` passing in the new `GnosisTrade` address.

# 3.0.0

### Upgrade Steps

#### Required Steps

Update _all_ component contracts, including Main.

Call the following functions:

- `BackingManager.cacheComponents()`
- `RevenueTrader.cacheComponents()` (for both rsrTrader and rTokenTrader)
- `Distributor.cacheComponents()`

_All_ asset plugins (and their corresponding ERC20s) must be upgraded. The only exception is the `StaticATokenLM` ERC20s from Aave V2. These can be left the same, however their assets should upgraded.

- Note: Make sure to use `Deployer.deployRTokenAsset()` to create new `RTokenAsset` instances. This asset should be swapped too.

#### Optional Steps

Call the following functions, once it is desired to turn on the new features:

- `BasketHandler.setWarmupPeriod()`
- `StRSR.setWithdrawalLeak()`
- `Broker.setDutchAuctionLength()`
- `Broker.setDutchTradeImplementation()`

It is acceptable to leave these function calls out of the initial upgrade tx and follow up with them later. The protocol will continue to function, just without dutch auctions, RSR unstaking gas-savings, and the warmup period.

### Core Protocol Contracts

- `AssetRegistry` [+1 slot]
  Summary: StRSR contract need to know when refresh() was last called
  - # Add last refresh timestamp tracking and expose via `lastRefresh()` getter
    Summary: Other component contracts need to know when refresh() was last called
  - Add `lastRefresh()` timestamp getter
  - Add `size()` getter for number of registered assets
  - Require asset is SOUND on registration
  - Bugfix: Fix gas attack that could result in someone disabling the basket
- `BackingManager` [+2 slots]
  Summary: manageTokens was broken out into separate rebalancing and surplus-forwarding functions to allow users to more precisely call the protocol

  - Replace `manageTokens(IERC20[] memory erc20s)` with:
    - `rebalance(TradeKind)`
      - Modify trading algorithm to not trade RToken, and instead dissolve it when it has a balance above ~1e6 RToken quanta. "dissolve" = melt() with a basketsNeeded change, similar to redemption but without transfer of RToken collateral.
      - Use `lotPrice()` to set trade prices instead of `price()`
      - Add significant caching to save gas
    - `forwardRevenue(IERC20[] memory erc20s)`
      - Modify backingBuffer logic to keep the backing buffer in collateral tokens only. Fix subtle and inconsequential bug that resulted in not maximizing RToken minting locally, though overall RToken production does not change.
      - Use `nonReentrant` over CEI pattern for gas improvement. related to discussion of [this](https://github.com/code-423n4/2023-01-reserve-findings/issues/347) cross-contract reentrancy risk
    - move `nonReentrant` up outside `tryTrade` internal helper
  - Remove `manageTokensSortedOrder(IERC20[] memory erc20s)`
  - Modify `settleTrade(IERC20 sell)` to call `rebalance()` when caller is a trade it deployed.
  - Remove all `delegatecall` during reward claiming; call `claimRewards()` directly on ERC20
  - Functions now revert on unproductive executions, instead of no-op
  - Do not trade until a warmupPeriod (last time SOUND was newly attained) has passed
  - Add `cacheComponents()` refresher to be called on upgrade
  - Add concept of `tradeNonce`
  - Bugfix: consider `maxTradeVolume()` from both assets on a trade, not just 1

- `BasketHandler` [+5 slots]
  Summary: Introduces a notion of basket warmup to defend against short-term oracle manipulation attacks. Prevent RTokens from changing in value due to governance

  - Add new gov param: `warmupPeriod` with setter `setWarmupPeriod(..)` and event `WarmupPeriodSet()`
  - Add `trackStatus()` refresher
  - Add `isReady()` view
  - Extract basket switching logic out into external library `BasketLibP1`
  - Enforce `setPrimeBasket()` does not change the net value of a basket in terms of its target units
  - Add `quoteCustomRedemption(uint48[] basketNonces, uint192[] memory portions, ..)` to quote a linear combination of current-or-previous baskets for redemption
  - Add `getHistoricalBasket(uint48 basketNonce)` view
  - Bugfix: Protect against high BU price overflow

- `Broker` [+2 slot]
  Summary: Add a second trading method for single-lot dutch auctions. Batch auctions via Gnosis EasyAuction are expected to be the backup auction going forward.

  - Add new dutch auction `DutchTrade`
  - Add minimum auction length of 20 blocks based on network block time
  - Rename variable `auctionLength` -> `batchAuctionLength`
  - Rename setter `setAuctionLength()` -> `setBatchAuctionLength()`
  - Rename event `AuctionLengthSet()` -> `BatchAuctionLengthSet()`
  - Add `dutchAuctionLength` and `setDutchAuctionLength()` setter and `DutchAuctionLengthSet()` event
  - Add `dutchTradeImplementation` and `setDutchTradeImplementation()` setter and `DutchTradeImplementationSet()` event
  - Modify `setBatchTradeDisabled(bool)` -> `enableBatchTrade()`
  - Modify `setDutchTradeDisabled(IERC20 erc20, bool)` -> `enableDutchTrade(IERC20 erc20)`
    - Unlike batch auctions, dutch auctions can be disabled _per-ERC20_, and can only be disabled by BackingManager-started trades
  - Modify `openTrade(TradeRequest memory reg)` -> `openTrade(TradeKind kind, TradeRequest memory req, TradePrices memory prices)`
    - Allow when paused / frozen, since caller must be in-system

- `Deployer` [+0 slots]
  Summary: Support new governance params

  - Modify to handle new gov params: `warmupPeriod`, `dutchAuctionLength`, and `withdrawalLeak`
  - Do not grant OWNER any of the roles other than ownership
  - Add `deployRTokenAsset()` to allow easy creation of new `RTokenAsset` instances

- `Distributor` [+2 slots]
  Summary: Restrict callers to system components and remove paused/frozen checks
  - Remove `notPausedOrFrozen` modifier from `distribute()`
- `Furnace` [+0 slots]
  Summary: Allow melting while paused

  - Allow melting while paused
  - Melt during updates to the melting ratio
  - Lower `MAX_RATIO` from 1e18 to 1e14.

- `Main` [+0 slots]
  Summary: Split pausing into two types of pausing: issuance and trading

  - Split `paused` into `issuancePaused` and `tradingPaused`
  - `pause()` -> `pauseTrading()` and `pauseIssuance()`
  - `unpause()` -> `unpauseTrading()` and `unpauseIssuance()`
  - `pausedOrFrozen()` -> `tradingPausedOrFrozen()` and `issuancePausedOrFrozen()`
  - `PausedSet()` event -> `TradingPausedSet()` and `IssuancePausedSet()`

- `RevenueTrader` [+4 slots]
  Summary: QoL improvements. Make compatible with new dutch auction trading method

  - Remove `delegatecall` during reward claiming; call `claimRewards()` directly on ERC20
  - Add `cacheComponents()` refresher to be called on upgrade
  - `manageToken(IERC20 sell)` -> `manageTokens(IERC20[] calldata erc20s, TradeKind[] memory kinds)`
    - Allow multiple auctions to be launched at once
    - Allow opening dust auctions (i.e ignore `minTradeVolume`)
    - Revert on 0 balance or collision auction instead of no-op
    - Refresh buy and sell asset before trade
  - `settleTrade(IERC20)` now distributes `tokenToBuy` automatically, instead of requiring separate `manageToken(IERC20)` call
  - Add `returnTokens(IERC20[] memory erc20s)` to return tokens to the BackingManager when the distribution is set to 0
  - Add concept of `tradeNonce`

- `RToken` [+0 slots]
  Summary: Provide multiple redemption methods for fullyCollateralized vs uncollateralized.

  - Gas: Remove `exchangeRateIsValidAfter` modifier from all functions except `setBasketsNeeded()`
  - Modify issuance`to revert before`warmupPeriod`
  - Modify `redeem(uint256 amount, uint48 basketNonce)` -> `redeem(uint256 amount)`. Redemptions are always on the current basket nonce and revert under partial redemption
  - Modify `redeemTo(address recipient, uint256 amount, uint48 basketNonce)` -> `redeemTo(address recipient, uint256 amount)`. Redemptions are on the current basket nonce and revert under partial redemption
  - Add new `redeemCustom(.., uint256 amount, uint48[] memory basketNonces, uint192[] memory portions, ..)` function to allow redemption from a linear combination of current and previous baskets. During rebalancing this method of redemption may provide a higher overall redemption value than prorata redemption on the current basket nonce would.
  - Modify `mint(address recipient, uint256 amtRToken)` -> `mint(uint256 amtRToken)`, since recipient is _always_ BackingManager. Expand scope to include adjustments to `basketsNeeded`
  - Add `dissolve(uint256 amount)`: burns RToken and reduces `basketsNeeded`, similar to redemption. Only callable by BackingManager
  - Modify `setBasketsNeeded(..)` to revert when supply is 0
  - Bugfix: Accumulate throttles upon change

- `StRSR` [+2 slots]
  Summary: Add the ability to cancel unstakings and a withdrawal() gas-saver to allow small RSR amounts to be exempt from asset refreshes

  - Lower `MAX_REWARD_RATIO` from 1e18 to 1e14.
  - Remove duplicate `stakeRate()` getter (same as `1 / exchangeRate()`)
  - Add `withdrawalLeak` gov param, with `setWithdrawalLeak(..)` setter and `WithdrawalLeakSet()` event
  - Modify `withdraw()` to allow a small % of RSR to exit without paying to refresh all assets
  - Modify `withdraw()` to check for `warmupPeriod`
  - Add `cancelUnstake(uint256 endId)` to allow re-staking during unstaking
  - Add `UnstakingCancelled()` event
  - Allow payout of (already acquired) RSR rewards while frozen
  - Add ability for governance to `resetStakes()` when stake rate falls outside (1e12, 1e24)

- `StRSRVotes` [+0 slots]
  - Add `stakeAndDelegate(uint256 rsrAmount, address delegate)` function to encourage people to receive voting weight upon staking

### Facades

Remove `FacadeMonitor` - now redundant with `nextRecollateralizationAuction()` and `revenueOverview()`

- `FacadeAct`
  Summary: Remove unused `getActCalldata()` and add way to run revenue auctions

  - Remove `getActCalldata(..)`
  - Remove `canRunRecollateralizationAuctions(..)`
  - Remove `runRevenueAuctions(..)`
  - Add `revenueOverview(IRevenueTrader) returns ( IERC20[] memory erc20s, bool[] memory canStart, uint256[] memory surpluses, uint256[] memory minTradeAmounts)`
  - Add `nextRecollateralizationAuction(..) returns (bool canStart, IERC20 sell, IERC20 buy, uint256 sellAmount)`
  - Modify all functions to work on both 3.0.0 and 2.1.0 RTokens

- `FacadeRead`
  Summary: Add new data summary views frontends may be interested in

  - Remove `basketNonce` from `redeem(.., uint48 basketNonce)`
  - Add `redeemCustom(.., uint48[] memory basketNonces, uint192[] memory portions)` callstatic to simulate multi-basket redemptions
  - Remove `traderBalances(..)`
  - Add `balancesAcrossAllTraders(IBackingManager) returns (IERC20[] memory erc20s, uint256[] memory balances, uint256[] memory balancesNeededByBackingManager)`

- `FacadeWrite`
  Summary: More expressive and fine-grained control over the set of pausers and freezers

  - Do not automatically grant Guardian PAUSER/SHORT_FREEZER/LONG_FREEZER
  - Do not automatically grant Owner PAUSER/SHORT_FREEZER/LONG_FREEZER
  - Add ability to initialize with multiple pausers, short freezers, and long freezers
  - Modify `setupGovernance(.., address owner, address guardian, address pauser)` -> `setupGovernance(.., GovernanceRoles calldata govRoles)`

## Plugins

### DutchTrade

A cheaper, simpler, trading method. Intended to be the new dominant trading method, with GnosisTrade (batch auctions) available as a backup option. Generally speaking the batch auction length can be kept shorter than the dutch auction length.

DutchTrade implements a four-stage, single-lot, falling price dutch auction:

1. In the first 20% of the auction, the price falls from 1000x the best price to the best price in a geometric/exponential decay as a price manipulation defense mechanism. Bids are not expected to occur (but note: unlike the GnosisTrade batch auction, this mechanism is not resistant to _arbitrary_ price manipulation). If a bid occurs, then trading for the pair of tokens is disabled as long as the trade was started by the BackingManager.
2. Between 20% and 45%, the price falls linearly from 1.5x the best price to the best price.
3. Between 45% and 95%, the price falls linearly from the best price to the worst price.
4. Over the last 5% of the auction, the price remains constant at the worst price.

Duration: 30 min (default)

### Assets and Collateral

- Add `version() return (string)` getter to pave way for separation of asset versioning and core protocol versioning
- Deprecate `claimRewards()`
- Add `lastSave()` to `RTokenAsset`
- Remove `CurveVolatileCollateral`
- Switch `CToken*Collateral` (Compound V2) to using a CTokenVault ERC20 rather than the raw cToken
- Bugfix: `lotPrice()` now begins at 100% the lastSavedPrice, instead of below 100%. It can be at 100% for up to the oracleTimeout in the worst-case.
- Bugfix: Handle oracle deprecation as indicated by the `aggregator()` being set to the zero address
- Bugfix: `AnkrStakedETHCollateral`/`CBETHCollateral`/`RethCollateral` now correctly detects soft default (note that Ankr still requires a new oracle before it can be deployed)
- Bugfix: Adjust `Curve*Collateral` and `RTokenAsset` to treat FIX_MAX correctly as +inf
- Bugfix: Continue updating cached price after collateral default (impacts all appreciating collateral)

# 2.1.0

### Core protocol contracts

- `BasketHandler`
  - Bugfix for `getPrimeBasket()` view
  - Minor change to `_price()` rounding
  - Minor natspec improvement to `refreshBasket()`
- `Broker`
  - Fix `GnosisTrade` trade implemention to treat defensive rounding by EasyAuction correctly
  - Add `setGnosis()` and `setTradeImplementation()` governance functions
- `RToken`
  - Minor gas optimization added to `redeemTo` to use saved `assetRegistry` variable
- `StRSR`
  - Expose RSR variables via `getDraftRSR()`, `getStakeRSR()`, and `getTotalDrafts()` views

### Facades

- `FacadeRead`
  - Extend `issue()` to return the estimated USD value of deposits as `depositsUoA`
  - Add `traderBalances()`
  - Add `auctionsSettleable()`
  - Add `nextRecollateralizationAuction()`
  - Modify `backingOverview() to handle unpriced cases`
- `FacadeAct`
  - Add `runRevenueAuctions()`

### Plugins

#### Assets and Collateral

Across all collateral, `tryPrice()` was updated to exclude revenueHiding considerations

- Deploy CRV + CVX plugins
- Add `AnkrStakedEthCollateral` + tests + deployment/verification scripts for ankrETH
- Add FluxFinance collateral tests + deployment/verification scripts for fUSDC, fUSDT, fDAI, and fFRAX
- Add CompoundV3 `CTokenV3Collateral` + tests + deployment/verification scripts for cUSDCV3
- Add Convex `CvxStableCollateral` + tests + deployment/verification scripts for 3Pool
- Add Convex `CvxVolatileCollateral` + tests + deployment/verification scripts for Tricrypto
- Add Convex `CvxStableMetapoolCollateral` + tests + deployment/verification scripts for MIM/3Pool
- Add Convex `CvxStableRTokenMetapoolCollateral` + tests + deployment/verification scripts for eUSD/fraxBP
- Add Frax `SFraxEthCollateral` + tests + deployment/verification scripts for sfrxETH
- Add Lido `LidoStakedEthCollateral` + tests + deployment/verification scripts for wstETH
- Add RocketPool `RethCollateral` + tests + deployment/verification scripts for rETH

### Testing

- Add generic collateral testing suite at `test/plugins/individual-collateral/collateralTests.ts`
- Add EasyAuction regression test for Broker false positive (observed during USDC de-peg)
- Add EasyAuction extreme tests

### Documentation

- Add `docs/plugin-addresses.md` as well as accompanying script for generation at `scripts/collateral-params.ts`
- Add `docs/exhaustive-tests.md` to document running exhaustive tests on GCP

# 2.0.0

Candidate release for the "all clear" milestone. There wasn't any real usage of the 1.0.0/1.1.0 releases; this is the first release that we are going to spend real effort to remain backwards compatible with.

- Bump solidity version to 0.8.17
- Support multiple beneficiaries via the [`FacadeWrite`](contracts/facade/FacadeWrite.sol)
- Add `RToken.issueTo(address recipient, uint256 amount, ..)` and `RToken.redeemTo(address recipient, uint256 amount, ..)` to support issuance/redemption to a different address than `msg.sender`
- Add `RToken.redeem*(.., uint256 basketNonce)` to enable msg sender to control expectations around partial redemptions
- Add `RToken.issuanceAvailable()` + `RToken.redemptionAvailable()`
- Add `FacadeRead.primeBasket()` + `FacadeRead.backupConfig()` views
- Many external libs moved to internal
- Switch from price point estimates to price ranges; all prices now have a `low` and `high`. Impacted interface functions:
  - `IAsset.price()`
  - `IBasketHandler.price()`
- Replace `IAsset.fallbackPrice()` with `IAsset.lotPrice()`. The lot price is the current price when available, and a fallback price otherwise.
- Introduce decaying fallback prices. Over a finite period of time the fallback price goes to zero, linearly.
- Remove `IAsset.pricePerTarget()` from asset interface
- Remove rewards earning and sweeping from RToken
- Add `safeMulDivCeil()` to `ITrading` traders. Use when overflow is possible from 2 locations:
  - [RecollateralizationLib.sol:L271](contracts/p1/mixins/RecollateralizationLib.sol)
  - [TradeLib.sol:L59](contracts/p1/mixins/TradeLib.sol)
- Introduce config struct to encapsulate Collateral constructor params more neatly
- In general it should be easier to write Collateral plugins. Implementors should _only_ ever have to override 4 functions: `tryPrice()`, `refPerTok()`, `targetPerRef()`, and `claimRewards()`.
- Add `.div(1 - maxTradeSlippage)` to calculation of `shortfallSlippage` in [RecollateralizationLib.sol:L188](contracts/p1/mixins/RecollateralizationLib.sol).
- FacadeRead:
  - remove `.pendingIssuances()` + `.endIdForVest()`
  - refactor calculations in `basketBreakdown()`
- Bugfix: Fix claim rewards from traders in `FacadeAct`
- Bugfix: Do not handout RSR rewards when no one is staked
- Bugfix: Support small redemptions even when the RToken supply is massive
- Bump component-wide `version()` getter to 2.0.0
- Remove non-atomic issuance
- Replace redemption battery with issuance and redemption throttles
  - `amtRate` valid range: `[1e18, 1e48]`
  - `pctRate` valid range: `[0, 1e18]`
- Fix Furnace/StRSR reward period to 12 seconds
- Gov params:
  - --`rewardPeriod`
  - --`issuanceRate`
  - ++`issuanceThrottle`
  - ++`redemptionThrottle`
- Events:
  - --`RToken.IssuanceStarted`
  - --`RToken.IssuancesCompleted`
  - --`RToken.IssuancesCanceled`
  - `Issuance( address indexed recipient, uint256 indexed amount, uint192 baskets )` -> `Issuance( address indexed issuer, address indexed recipient, uint256 indexed amount, uint192 baskets )`
  - `Redemption(address indexed recipient, uint256 indexed amount, uint192 baskets )` -> `Redemption(address indexed redeemer, address indexed recipient, uint256 indexed amount, uint192 baskets )`
  - ++`RToken.IssuanceThrottleSet`
  - ++`RToken.RedemptionThrottleSet`
- Allow redemption while DISABLED
- Allow `grantRTokenAllowances()` while paused
- Add `RToken.monetizeDonations()` escape hatch for accidentally donated tokens
- Collateral default threshold: 5% -> 1% (+ include oracleError)
- RecollateralizationLib: Tighter basket range during recollateralization. Will now do `minTradeVolume`-size auctions to fill in dust rather than haircut.
- Remove StRSR.setName()/setSymbol()
- Prevent RToken exchange rate manipulation at low supply
- Prevent StRSR exchange rate manipulation at low supply
- Forward RSR directly to StRSR, bypassing RSRTrader
- Accumulate melting on `Furnace.setRatio()`
- Payout RSR rewards on `StRSR.setRatio()`
- Distinguish oracle timeouts when dealing with multiple oracles in one plugin
- Add safety during asset degregistration to ensure it is always possible to unregister an infinite-looping asset
- Fix `StRSR`/`RToken` EIP712 typehash to use release version instead of "1"
- Add `FacadeRead.redeem(IRToken rToken, uint256 amount, uint48 basketNonce)` to return the expected redemption quantities on the basketNonce, or revert
- Integrate with OZ 4.7.3 Governance (changes to `quorum()`/t`proposalThreshold()`)

# 1.1.0

- Introduce semantic versioning to the Deployer and RToken
- `RTokenCreated` event: added `version` argument

```
event RTokenCreated(
        IMain indexed main,
        IRToken indexed rToken,
        IStRSR stRSR,
        address indexed owner
    );

```

=>

```
event RTokenCreated(
        IMain indexed main,
        IRToken indexed rToken,
        IStRSR stRSR,
        address indexed owner,
        string version
    );

```

- Add `version()` getter on Deployer, Main, and all Components, via mix-in. To be updated with each subsequent release.

[d757d3a5a6097ae42c71fc03a7c787ec001d2efc](https://github.com/reserve-protocol/protocol/commit/d757d3a5a6097ae42c71fc03a7c787ec001d2efc)

# 1.0.0

(This release is the one from the canonical lauch onstage in Bogota. We were missing semantic versioning at the time, but we call this the 1.0.0 release retroactively.)

[eda322894a5ed379bbda2b399c9d1cc65aa8c132](https://github.com/reserve-protocol/protocol/commit/eda322894a5ed379bbda2b399c9d1cc65aa8c132)

# Links

- [[Unreleased]](https://github.com/reserve-protocol/protocol/releases/tag/3.0.0-rc1)
  - https://github.com/reserve-protocol/protocol/compare/2.1.0-rc4...3.0.0
- [[2.1.0]](https://github.com/reserve-protocol/protocol/releases/tag/2.1.0-rc4)
  - https://github.com/reserve-protocol/protocol/compare/2.0.0-candidate-4...2.1.0-rc4
- [[2.0.0]](https://github.com/reserve-protocol/protocol/releases/tag/2.0.0-candidate-4)
  - https://github.com/reserve-protocol/protocol/compare/1.1.0...2.0.0-candidate-4
- [[1.1.0]](https://github.com/reserve-protocol/protocol/releases/tag/1.1.0)
  - https://github.com/reserve-protocol/protocol/compare/1.0.0...1.1.0
- [[1.0.0]](https://github.com/reserve-protocol/protocol/releases/tag/1.0.0)
  - https://github.com/reserve-protocol/protocol/releases/tag/1.0.0
