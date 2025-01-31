// SPDX-License-Identifier: BlueOak-1.0.0
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../libraries/Fixed.sol";
import "../interfaces/IMain.sol";
import "../mixins/ComponentRegistry.sol";
import "../mixins/Auth.sol";
import "../mixins/Versioned.sol";

/**
 * @title Main
 * @notice Collects all mixins.
 */
// solhint-disable max-states-count
contract MainP0 is Versioned, Initializable, Auth, ComponentRegistry, IMain {
    using FixLib for uint192;

    IERC20 public rsr;

    /// Initializer
    function init(
        Components memory components,
        IERC20 rsr_,
        uint48 shortFreeze_,
        uint48 longFreeze_
    ) public virtual initializer {
        require(address(rsr_) != address(0), "invalid RSR address");

        __Auth_init(shortFreeze_, longFreeze_);
        __ComponentRegistry_init(components);

        rsr = rsr_;
        emit MainInitialized();
    }

    /// @custom:refresher
    function poke() external {
        assetRegistry.refresh();
        if (!frozen()) furnace.melt();
        stRSR.payoutRewards();
        // NOT basketHandler.refreshBasket
    }

    function hasRole(bytes32 role, address account)
        public
        view
        override(IAccessControlUpgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.hasRole(role, account);
    }
}
