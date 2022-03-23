// SPDX-License-Identifier: BlueOak-1.0.0
pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "contracts/libraries/Fixed.sol";
import "contracts/interfaces/IMain.sol";

/// Only Main is Pausable
contract Pausable is Ownable, IPausable {
    address private _pauser;
    bool public paused;

    constructor() {
        _pauser = _msgSender();
        paused = true;
    }

    modifier notPaused() {
        require(!paused, "paused");
        _;
    }

    function pause() external {
        require(_msgSender() == _pauser || _msgSender() == owner(), "only pauser or owner");
        emit PausedSet(paused, true);
        paused = true;
    }

    function unpause() external {
        require(_msgSender() == _pauser || _msgSender() == owner(), "only pauser or owner");
        emit PausedSet(paused, false);
        paused = false;
    }

    function pauser() external view returns (address) {
        return _pauser;
    }

    function setPauser(address pauser_) external {
        require(_msgSender() == _pauser || _msgSender() == owner(), "only pauser or owner");
        emit PauserSet(_pauser, pauser_);
        _pauser = pauser_;
    }
}

/**
 * @title Main
 * @notice Collects all mixins.
 */
// solhint-disable max-states-count
contract MainP0 is Pausable, IMain {
    using FixLib for int192;

    // Already initialized?
    bool internal initialized;

    function poke() external virtual notPaused {
        // We think these are totally order-independent.
        basketHandler.ensureBasket();
        furnace.melt();
        rsrTrader.settleTrades();
        rTokenTrader.settleTrades();
        backingManager.settleTrades();
        stRSR.payoutRewards();
    }

    function owner() public view override(IMain, Ownable) returns (address) {
        return Ownable.owner();
    }

    /// Initializer
    function init(ConstructorArgs memory args) public virtual onlyOwner {
        require(!initialized, "Already initialized");
        initialized = true;

        setBackingManager(args.components.backingManager);
        backingManager.initComponent(this, args);

        setBasketHandler(args.components.basketHandler);
        basketHandler.initComponent(this, args);

        setRSRTrader(args.components.rsrTrader);
        rsrTrader.initComponent(this, args);

        setRTokenTrader(args.components.rTokenTrader);
        rTokenTrader.initComponent(this, args);

        setAssetRegistry(args.components.assetRegistry);
        assetRegistry.initComponent(this, args);

        setDistributor(args.components.distributor);
        distributor.initComponent(this, args);

        setFurnace(args.components.furnace);
        furnace.initComponent(this, args);

        setBroker(args.components.broker);
        broker.initComponent(this, args);

        setStRSR(args.components.stRSR);
        stRSR.initComponent(this, args);

        setRToken(args.components.rToken);
        rToken.initComponent(this, args);

        setRSR(args.rsr);

        emit Initialized();
    }

    // === Registered Contracts ===

    IRToken public rToken;

    function setRToken(IRToken val) public onlyOwner {
        emit RTokenSet(rToken, val);
        rToken = val;
    }

    IStRSR public stRSR;

    function setStRSR(IStRSR val) public onlyOwner {
        emit StRSRSet(stRSR, val);
        stRSR = val;
    }

    IAssetRegistry public assetRegistry;

    function setAssetRegistry(IAssetRegistry val) public onlyOwner {
        emit AssetRegistrySet(assetRegistry, val);
        assetRegistry = val;
    }

    IBasketHandler public basketHandler;

    function setBasketHandler(IBasketHandler val) public onlyOwner {
        emit BasketHandlerSet(basketHandler, val);
        basketHandler = val;
    }

    IBackingManager public backingManager;

    function setBackingManager(IBackingManager val) public onlyOwner {
        emit BackingManagerSet(backingManager, val);
        backingManager = val;
    }

    IDistributor public distributor;

    function setDistributor(IDistributor val) public onlyOwner {
        emit DistributorSet(distributor, val);
        distributor = val;
    }

    IRevenueTrader public rsrTrader;

    function setRSRTrader(IRevenueTrader val) public onlyOwner {
        emit RSRTraderSet(rsrTrader, val);
        rsrTrader = val;
    }

    IRevenueTrader public rTokenTrader;

    function setRTokenTrader(IRevenueTrader val) public onlyOwner {
        emit RTokenTraderSet(rTokenTrader, val);
        rTokenTrader = val;
    }

    IFurnace public furnace;

    function setFurnace(IFurnace val) public onlyOwner {
        emit FurnaceSet(furnace, val);
        furnace = val;
    }

    IBroker public broker;

    function setBroker(IBroker val) public onlyOwner {
        emit BrokerSet(broker, val);
        broker = val;
    }

    // === Non-components ===

    IERC20 public rsr;

    function setRSR(IERC20 val) public onlyOwner {
        emit RSRSet(rsr, val);
        rsr = val;
    }
}
