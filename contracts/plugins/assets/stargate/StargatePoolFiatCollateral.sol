// SPDX-License-Identifier: BlueOak-1.0.0
pragma solidity 0.8.19;

import "../../../libraries/Fixed.sol";
import "../AppreciatingFiatCollateral.sol";
import "./interfaces/IStargatePool.sol";
import "./StargateRewardableWrapper.sol";

/**
 * @title StargatePoolFiatCollateral
 * @notice Collateral plugin for Stargate USD Stablecoins,
 * tok = wstgUSDC / wstgUSDT
 * ref = USDC / USDT
 * tar = USD
 * UoA = USD
 */
contract StargatePoolFiatCollateral is AppreciatingFiatCollateral {
    IStargatePool private immutable pool;

    /// @param config.chainlinkFeed Feed units: {UoA/ref}
    // solhint-disable no-empty-blocks
    constructor(CollateralConfig memory config, uint192 revenueHiding)
        AppreciatingFiatCollateral(config, revenueHiding)
    {
        pool = StargateRewardableWrapper(address(config.erc20)).pool();
    }

    /// @return _rate {ref/tok} Quantity of whole reference units per whole collateral tokens
    function _underlyingRefPerTok() internal view virtual override returns (uint192) {
        uint256 _totalSupply = pool.totalSupply();
        uint192 _rate = FIX_ONE; // 1:1 if pool has no tokens at all
        if (_totalSupply != 0) {
            _rate = divuu(pool.totalLiquidity(), _totalSupply);
        }

        return _rate;
    }

    function claimRewards() external override(Asset, IRewardable) {
        StargateRewardableWrapper(address(erc20)).claimRewards();
    }
}
