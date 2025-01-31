import hre, { ethers } from 'hardhat'

import { getChainId } from '../../common/blockchain-utils'
import { baseL2Chains, developmentChains, networkConfig } from '../../common/configuration'
import { fp, bn } from '../../common/numbers'
import {
  getDeploymentFile,
  getAssetCollDeploymentFilename,
  IAssetCollDeployments,
} from '../deployment/common'
import {
  combinedError,
  priceTimeout,
  oracleTimeout,
  revenueHiding,
  verifyContract,
} from '../deployment/utils'
import { ATokenMock, ATokenFiatCollateral, ICToken, CTokenFiatCollateral } from '../../typechain'

let deployments: IAssetCollDeployments

async function main() {
  // ********** Read config **********
  const chainId = await getChainId(hre)
  if (!networkConfig[chainId]) {
    throw new Error(`Missing network configuration for ${hre.network.name}`)
  }

  if (developmentChains.includes(hre.network.name)) {
    throw new Error(`Cannot verify contracts for development chain ${hre.network.name}`)
  }

  const assetCollDeploymentFilename = getAssetCollDeploymentFilename(chainId)
  deployments = <IAssetCollDeployments>getDeploymentFile(assetCollDeploymentFilename)

  /********  Verify Fiat Collateral - DAI  **************************/
  const daiOracleTimeout = baseL2Chains.includes(hre.network.name) ? 86400 : 3600 // 24 hr (Base) or 1 hour
  const daiOracleError = baseL2Chains.includes(hre.network.name) ? fp('0.003') : fp('0.0025') // 0.3% (Base) or 0.25%

  await verifyContract(
    chainId,
    deployments.collateral.DAI,
    [
      {
        priceTimeout: priceTimeout.toString(),
        chainlinkFeed: networkConfig[chainId].chainlinkFeeds.DAI,
        oracleError: daiOracleError.toString(),
        erc20: networkConfig[chainId].tokens.DAI,
        maxTradeVolume: fp('1e6').toString(), // $1m,
        oracleTimeout: oracleTimeout(chainId, daiOracleTimeout).toString(),
        targetName: hre.ethers.utils.formatBytes32String('USD'),
        defaultThreshold: fp('0.01').add(daiOracleError).toString(),
        delayUntilDefault: bn('86400').toString(), // 24h
      },
    ],
    'contracts/plugins/assets/FiatCollateral.sol:FiatCollateral'
  )

  /********  Verify Fiat Collateral - USDbC  **************************/
  const usdcOracleTimeout = 86400 // 24 hr
  const usdcOracleError = baseL2Chains.includes(hre.network.name) ? fp('0.003') : fp('0.0025') // 0.3% (Base) or 0.25%

  if (baseL2Chains.includes(hre.network.name)) {
    await verifyContract(
      chainId,
      deployments.collateral.USDbC,
      [
        {
          priceTimeout: priceTimeout.toString(),
          chainlinkFeed: networkConfig[chainId].chainlinkFeeds.USDC,
          oracleError: usdcOracleError.toString(),
          erc20: networkConfig[chainId].tokens.USDbC,
          maxTradeVolume: fp('1e6').toString(), // $1m,
          oracleTimeout: oracleTimeout(chainId, usdcOracleTimeout).toString(),
          targetName: hre.ethers.utils.formatBytes32String('USD'),
          defaultThreshold: fp('0.01').add(usdcOracleError).toString(),
          delayUntilDefault: bn('86400').toString(), // 24h
        },
      ],
      'contracts/plugins/assets/FiatCollateral.sol:FiatCollateral'
    )
  }

  /********  Verify StaticATokenLM - aDAI  **************************/
  // Get AToken to retrieve name and symbol
  const aToken: ATokenMock = <ATokenMock>(
    await ethers.getContractAt('ATokenMock', networkConfig[chainId].tokens.aDAI as string)
  )
  const aTokenCollateral: ATokenFiatCollateral = <ATokenFiatCollateral>(
    await ethers.getContractAt('ATokenFiatCollateral', deployments.collateral.aDAI as string)
  )

  await verifyContract(
    chainId,
    await aTokenCollateral.erc20(),
    [
      networkConfig[chainId].AAVE_LENDING_POOL as string,
      aToken.address,
      'Static ' + (await aToken.name()),
      's' + (await aToken.symbol()),
    ],
    'contracts/plugins/assets/aave/StaticATokenLM.sol:StaticATokenLM'
  )
  /********  Verify ATokenFiatCollateral - aDAI  **************************/
  await verifyContract(
    chainId,
    aTokenCollateral.address,
    [
      {
        priceTimeout: priceTimeout.toString(),
        chainlinkFeed: networkConfig[chainId].chainlinkFeeds.DAI,
        oracleError: fp('0.0025').toString(), // 0.25%
        erc20: await aTokenCollateral.erc20(),
        maxTradeVolume: fp('1e6').toString(), // $1m,
        oracleTimeout: oracleTimeout(chainId, '3600').toString(), // 1 hr
        targetName: hre.ethers.utils.formatBytes32String('USD'),
        defaultThreshold: fp('0.0125').toString(), // 1.25%
        delayUntilDefault: bn('86400').toString(), // 24h
      },
      revenueHiding.toString(),
    ],
    'contracts/plugins/assets/aave/ATokenFiatCollateral.sol:ATokenFiatCollateral'
  )
  /********  Verify CTokenWrapper - cDAI  **************************/
  const cToken: ICToken = <ICToken>(
    await ethers.getContractAt('ICToken', networkConfig[chainId].tokens.cDAI as string)
  )
  const cTokenCollateral: CTokenFiatCollateral = <CTokenFiatCollateral>(
    await ethers.getContractAt('CTokenFiatCollateral', deployments.collateral.cDAI as string)
  )

  await verifyContract(
    chainId,
    await cTokenCollateral.erc20(),
    [
      cToken.address,
      `${await cToken.name()} Vault`,
      `${await cToken.symbol()}-VAULT`,
      networkConfig[chainId].COMPTROLLER!,
    ],
    'contracts/plugins/assets/compoundv2/CTokenWrapper.sol:CTokenWrapper'
  )
  /********************** Verify CTokenFiatCollateral - cDAI  ****************************************/
  await verifyContract(
    chainId,
    deployments.collateral.cDAI,
    [
      {
        priceTimeout: priceTimeout.toString(),
        chainlinkFeed: networkConfig[chainId].chainlinkFeeds.DAI,
        oracleError: fp('0.0025').toString(), // 0.25%
        erc20: deployments.erc20s.cDAI,
        maxTradeVolume: fp('1e6').toString(), // $1m,
        oracleTimeout: oracleTimeout(chainId, '3600').toString(),
        targetName: hre.ethers.utils.formatBytes32String('USD'),
        defaultThreshold: fp('0.0125').toString(), // 1.25%
        delayUntilDefault: bn('86400').toString(), // 24h
      },
      revenueHiding.toString(),
    ],
    'contracts/plugins/assets/compoundv2/CTokenFiatCollateral.sol:CTokenFiatCollateral'
  )
  /********************** Verify CTokenNonFiatCollateral - cWBTC  ****************************************/

  const wbtcOracleError = fp('0.02') // 2%
  const btcOracleError = fp('0.005') // 0.5%
  const combinedBTCWBTCError = combinedError(wbtcOracleError, btcOracleError)

  await verifyContract(
    chainId,
    deployments.collateral.cWBTC,
    [
      {
        priceTimeout: priceTimeout.toString(),
        chainlinkFeed: networkConfig[chainId].chainlinkFeeds.WBTC,
        oracleError: combinedBTCWBTCError.toString(),
        erc20: deployments.erc20s.cWBTC,
        maxTradeVolume: fp('1e6').toString(), // $1m,
        oracleTimeout: oracleTimeout(chainId, '86400').toString(), // 24 hr
        targetName: hre.ethers.utils.formatBytes32String('BTC'),
        defaultThreshold: fp('0.01').add(combinedBTCWBTCError).toString(), // ~3.5%
        delayUntilDefault: bn('86400').toString(), // 24h
      },
      networkConfig[chainId].chainlinkFeeds.BTC,
      oracleTimeout(chainId, '3600').toString(),
      revenueHiding.toString(),
    ],
    'contracts/plugins/assets/compoundv2/CTokenNonFiatCollateral.sol:CTokenNonFiatCollateral'
  )
  /********************** Verify CTokenSelfReferentialFiatCollateral - cETH  ****************************************/
  await verifyContract(
    chainId,
    deployments.collateral.cETH,
    [
      {
        priceTimeout: priceTimeout.toString(),
        chainlinkFeed: networkConfig[chainId].chainlinkFeeds.ETH,
        oracleError: fp('0.005').toString(), // 0.5%
        erc20: deployments.erc20s.cETH,
        maxTradeVolume: fp('1e6').toString(), // $1m,
        oracleTimeout: oracleTimeout(chainId, '3600').toString(),
        targetName: hre.ethers.utils.formatBytes32String('ETH'),
        defaultThreshold: '0',
        delayUntilDefault: '0',
      },
      revenueHiding.toString(),
      '18',
    ],
    'contracts/plugins/assets/compoundv2/CTokenSelfReferentialCollateral.sol:CTokenSelfReferentialCollateral'
  )
  /********************** Verify NonFiatCollateral - wBTC  ****************************************/
  await verifyContract(
    chainId,
    deployments.collateral.WBTC,
    [
      {
        priceTimeout: priceTimeout.toString(),
        chainlinkFeed: networkConfig[chainId].chainlinkFeeds.WBTC,
        oracleError: combinedBTCWBTCError.toString(),
        erc20: networkConfig[chainId].tokens.WBTC,
        maxTradeVolume: fp('1e6').toString(), // $1m,
        oracleTimeout: oracleTimeout(chainId, '86400').toString(),
        targetName: ethers.utils.formatBytes32String('BTC'),
        defaultThreshold: fp('0.01').add(combinedBTCWBTCError).toString(), // ~3.5%
        delayUntilDefault: bn('86400').toString(), // 24h
      },
      networkConfig[chainId].chainlinkFeeds.BTC,
      oracleTimeout(chainId, '3600').toString(),
    ],
    'contracts/plugins/assets/NonFiatCollateral.sol:NonFiatCollateral'
  )

  /********************** Verify SelfReferentialCollateral - WETH  ****************************************/
  const ethOracleTimeout = baseL2Chains.includes(hre.network.name) ? 1200 : 3600 // 20 min (Base) or 1 hr
  const ethOracleError = baseL2Chains.includes(hre.network.name) ? fp('0.0015') : fp('0.005') // 0.15% (Base) or 0.5%

  await verifyContract(
    chainId,
    deployments.collateral.WETH,
    [
      {
        priceTimeout: priceTimeout.toString(),
        chainlinkFeed: networkConfig[chainId].chainlinkFeeds.ETH,
        oracleError: ethOracleError.toString(), // 0.5%
        erc20: networkConfig[chainId].tokens.WETH,
        maxTradeVolume: fp('1e6').toString(), // $1m,
        oracleTimeout: oracleTimeout(chainId, ethOracleTimeout).toString(),
        targetName: hre.ethers.utils.formatBytes32String('ETH'),
        defaultThreshold: '0',
        delayUntilDefault: '0',
      },
    ],
    'contracts/plugins/assets/SelfReferentialCollateral.sol:SelfReferentialCollateral'
  )

  /********************** Verify EURFiatCollateral - EURT  ****************************************/
  await verifyContract(
    chainId,
    deployments.collateral.EURT,
    [
      {
        priceTimeout: priceTimeout.toString(),
        chainlinkFeed: networkConfig[chainId].chainlinkFeeds.EURT,
        oracleError: fp('0.02').toString(), // 2%
        erc20: networkConfig[chainId].tokens.EURT,
        maxTradeVolume: fp('1e6').toString(), // $1m,
        oracleTimeout: oracleTimeout(chainId, '86400').toString(),
        targetName: ethers.utils.formatBytes32String('EUR'),
        defaultThreshold: fp('0.03').toString(), // 3%
        delayUntilDefault: bn('86400').toString(), // 24h
      },
      networkConfig[chainId].chainlinkFeeds.EUR,
      oracleTimeout(chainId, '86400').toString(),
    ],
    'contracts/plugins/assets/EURFiatCollateral.sol:EURFiatCollateral'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
