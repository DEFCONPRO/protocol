/* eslint-disable no-process-exit */
import hre from 'hardhat'
import { getChainId } from '../common/blockchain-utils'
import { baseL2Chains, developmentChains, networkConfig } from '../common/configuration'
import { sh } from './deployment/utils'
import {
  getDeploymentFile,
  getAssetCollDeploymentFilename,
  IAssetCollDeployments,
  IDeployments,
  getDeploymentFilename,
} from './deployment/common'

async function main() {
  const chainId = await getChainId(hre)

  // Check if chain is supported
  if (!networkConfig[chainId]) {
    throw new Error(`Missing network configuration for ${hre.network.name}`)
  }

  if (developmentChains.includes(hre.network.name)) {
    throw new Error(`Cannot verify contracts for development chain ${hre.network.name}`)
  }

  const phase1Deployments = <IDeployments>getDeploymentFile(getDeploymentFilename(chainId))
  const assetCollDeploymentFilename = getAssetCollDeploymentFilename(chainId)
  const assetDeployments = <IAssetCollDeployments>getDeploymentFile(assetCollDeploymentFilename)
  if (!phase1Deployments || !assetDeployments) throw new Error('Missing deployments')

  console.log(`Starting full verification on network ${hre.network.name} (${chainId})`)

  // Part 3/3 of the *overall* deployment process: Verification

  // This process is intelligent enough that it can be run on all verify scripts,
  // even if some portions have already been verified

  // Phase 1- Common
  const scripts = [
    '0_verify_libraries.ts',
    '1_verify_implementations.ts',
    '2_verify_rsrAsset.ts',
    '3_verify_deployer.ts',
    '4_verify_facade.ts',
    '5_verify_facadeWrite.ts',
    '6_verify_collateral.ts',
  ]

  // Phase 2 - Individual Plugins
  if (!baseL2Chains.includes(hre.network.name)) {
    scripts.push(
      'collateral-plugins/verify_convex_stable.ts',
      'collateral-plugins/verify_convex_stable_metapool.ts',
      'collateral-plugins/verify_convex_stable_rtoken_metapool.ts',
      'collateral-plugins/verify_curve_stable.ts',
      'collateral-plugins/verify_curve_stable_metapool.ts',
      'collateral-plugins/verify_curve_stable_rtoken_metapool.ts',
      'collateral-plugins/verify_cusdcv3.ts',
      'collateral-plugins/verify_reth.ts',
      'collateral-plugins/verify_wsteth.ts',
      'collateral-plugins/verify_cbeth.ts',
      'collateral-plugins/verify_sdai.ts',
      'collateral-plugins/verify_morpho.ts',
      'collateral-plugins/verify_aave_v3_usdc.ts',
      'collateral-plugins/verify_sfrax.ts'
    )
  } else if (chainId == '8453' || chainId == '84531') {
    // Base L2 chains
    scripts.push(
      'collateral-plugins/verify_cbeth.ts',
      'collateral-plugins/verify_cusdbcv3.ts',
      'collateral-plugins/verify_aave_v3_usdbc',
      'collateral-plugins/verify_stargate_usdc',
      'assets/verify_stg.ts'
    )
  }

  // Phase 3 - RTokens and Governance
  // '7_verify_rToken.ts',
  // '8_verify_governance.ts',

  for (const script of scripts) {
    console.log('\n===========================================\n', script, '')
    await sh(`hardhat run scripts/verification/${script}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
