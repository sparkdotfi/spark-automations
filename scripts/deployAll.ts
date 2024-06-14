import * as fs from 'fs'
import { ethers } from 'ethers'
import { AutomateSDK, TaskTransaction, TriggerType, Web3Function } from '@gelatonetwork/automate-sdk'

import { dsNoteAbi, oracleAbi, oracleAggregatorAbi } from '../abis'
import { addresses } from '../utils'

const hourInMilliseconds = 1000 * 60 * 60
const fiveMinutesInMilliseconds = 1000 * 60 * 5

console.log('== Preparing a deployment of all the keeper actions ==')

const keystorePath = process.argv[2] || (process.env.KEYSTORE_PATH as string)
const passwordPath = process.argv[3] || (process.env.PASSWORD_PATH as string)

const password = passwordPath ? fs.readFileSync(passwordPath, 'utf8').slice(0, -1) : ''
const keystore = fs.readFileSync(keystorePath, 'utf8')
const deployer = ethers.Wallet.fromEncryptedJsonSync(keystore, password)

const mainnetAutomation = new AutomateSDK(1, deployer)
const mainnetManagement = new Web3Function(1, deployer)

const gnosisAutomation = new AutomateSDK(100, deployer)
const gnosisManagement = new Web3Function(100, deployer)

const slackWebhookUrl = process.env.GELATO_KEEPERS_SLACK_WEBHOOK_URL
if (!slackWebhookUrl) {
    console.error('Set a valid value for GELATO_KEEPERS_SLACK_WEBHOOK_URL')
    process.exit(1)
}

const etherscanApiKey = process.env.GELATO_KEEPERS_ETHERSCAN_API_KEY
if (!etherscanApiKey) {
    console.error('Set a valid value for GELATO_KEEPERS_ETHERSCAN_API_KEY')
    process.exit(1)
}

console.log('   * Deployer: ', deployer.address)

const ipfsDeployments = JSON.parse(fs.readFileSync('./scripts/pre-deployments.json'))
const gelatoDeployments = JSON.parse(fs.readFileSync('./scripts/deployments.json'))

let ipfsDeployment: string
let gelatoDeployment: string
let wf3Name: string

const deploy = async (w3fName: string, deploymentLogic: () => Promise<void>) => {
    ipfsDeployment = ipfsDeployments[w3fName]
    gelatoDeployment = gelatoDeployments[w3fName]

    console.log(`\n== Deploying ${w3fName} ==`)

    if (ipfsDeployment == undefined) {
        console.log(`   * Skipping ${w3fName} deployment (no IPFS deployment found)`)
    } else if (ipfsDeployment == gelatoDeployment) {
        console.log(`   * Skipping ${w3fName} deployment (already deployed)`)
    } else {
        console.log(`   * Deploying ${w3fName}...`)
        await deploymentLogic()

        gelatoDeployments[w3fName] = ipfsDeployment
        fs.writeFileSync('./scripts/deployments.json', JSON.stringify(gelatoDeployments, null, 4).concat('\n'))
    }
}

;(async () => {
    // *****************************************************************************************************************
    // ********** CAP AUTOMATOR ****************************************************************************************
    // *****************************************************************************************************************
    await deploy('cap-automator', async () => {
        const { taskId, tx }: TaskTransaction = await mainnetAutomation.createBatchExecTask({
            name: 'Cap Automator',
            web3FunctionHash: ipfsDeployment,
            web3FunctionArgs: {
                threshold: 5000, // less than 5.000bps (50%) of the gap left under the cap
                performGasCheck: true,
                sendSlackMessages: true,
            },
            trigger: {
                type: TriggerType.TIME,
                interval: hourInMilliseconds,
            },
        })

        await tx.wait()
        await mainnetManagement.secrets.set(
            {
                SLACK_WEBHOOK_URL: slackWebhookUrl,
                ETHERSCAN_API_KEY: etherscanApiKey,
            },
            taskId,
        )
    })

    // *****************************************************************************************************************
    // ********** D3M TICKER *******************************************************************************************
    // *****************************************************************************************************************
    await deploy('d3m-ticker', async () => {
        const { taskId, tx }: TaskTransaction = await mainnetAutomation.createBatchExecTask({
            name: 'D3M Ticker',
            web3FunctionHash: ipfsDeployment,
            web3FunctionArgs: {
                threshold: '20000000000000000000000000', // 20M DAI (20.000.000e18 DAI)
                performGasCheck: true,
                sendSlackMessages: true,
            },
            trigger: {
                type: TriggerType.TIME,
                interval: hourInMilliseconds,
            },
        })

        await tx.wait()
        await mainnetManagement.secrets.set(
            {
                SLACK_WEBHOOK_URL: slackWebhookUrl,
                ETHERSCAN_API_KEY: etherscanApiKey,
            },
            taskId,
        )
    })

    // *****************************************************************************************************************
    // ********** GOVERNANCE EXECUTOR **********************************************************************************
    // *****************************************************************************************************************
    await deploy('governance-executor', async () => {
        const { taskId, tx }: TaskTransaction = await gnosisAutomation.createBatchExecTask({
            name: 'Governance Executor [Gnosis]',
            web3FunctionHash: ipfsDeployment,
            web3FunctionArgs: {
                domain: 'gnosis',
                sendSlackMessages: true,
            },
            trigger: {
                type: TriggerType.TIME,
                interval: hourInMilliseconds,
            },
        })

        await tx.wait()
        await gnosisManagement.secrets.set(
            {
                SLACK_WEBHOOK_URL: slackWebhookUrl,
            },
            taskId,
        )
    })

    // *****************************************************************************************************************
    // ********** KILL SWITCH ******************************************************************************************
    // *****************************************************************************************************************
    await deploy('kill-switch', async () => {
        const aggregatorInterface = new ethers.utils.Interface(oracleAggregatorAbi)

        const wbtcBtcOracle = new ethers.Contract(addresses.mainnet.priceSources.wbtcBtc, oracleAbi, deployer)
        const wbtcBtcAggregator = await wbtcBtcOracle.aggregator()

        const { taskId: wbtcBtcTaskId, tx: wbtcBtcTx }: TaskTransaction = await mainnetAutomation.createBatchExecTask({
            name: 'Kill Switch [WBTC-BTC]',
            web3FunctionHash: ipfsDeployment,
            web3FunctionArgs: {
                sendSlackMessages: true,
            },
            trigger: {
                type: TriggerType.EVENT,
                filter: {
                    address: wbtcBtcAggregator,
                    topics: [[aggregatorInterface.getEventTopic('AnswerUpdated')]],
                },
                blockConfirmations: 0,
            },
        })

        await wbtcBtcTx.wait()
        await mainnetManagement.secrets.set(
            {
                SLACK_WEBHOOK_URL: slackWebhookUrl,
            },
            wbtcBtcTaskId,
        )

        const stethEthOracle = new ethers.Contract(addresses.mainnet.priceSources.stethEth, oracleAbi, deployer)
        const stethEthAggregator = await stethEthOracle.aggregator()

        const { taskId: stethEthTaskId, tx: stethEthTx }: TaskTransaction = await mainnetAutomation.createBatchExecTask(
            {
                name: 'Kill Switch [stETH-ETH]',
                web3FunctionHash: ipfsDeployment,
                web3FunctionArgs: {
                    sendSlackMessages: true,
                },
                trigger: {
                    type: TriggerType.EVENT,
                    filter: {
                        address: stethEthAggregator,
                        topics: [[aggregatorInterface.getEventTopic('AnswerUpdated')]],
                    },
                    blockConfirmations: 0,
                },
            },
        )

        await stethEthTx.wait()
        await mainnetManagement.secrets.set(
            {
                SLACK_WEBHOOK_URL: slackWebhookUrl,
            },
            stethEthTaskId,
        )

        const { taskId: timeBasedTaskId, tx: timeBasedTx }: TaskTransaction =
            await mainnetAutomation.createBatchExecTask({
                name: 'Kill Switch [Time Based]',
                web3FunctionHash: ipfsDeployment,
                web3FunctionArgs: {
                    sendSlackMessages: true,
                },
                trigger: {
                    type: TriggerType.TIME,
                    interval: fiveMinutesInMilliseconds,
                },
            })

        await timeBasedTx.wait()
        await mainnetManagement.secrets.set(
            {
                SLACK_WEBHOOK_URL: slackWebhookUrl,
            },
            timeBasedTaskId,
        )
    })

    // *****************************************************************************************************************
    // ********** META MORPHO ******************************************************************************************
    // *****************************************************************************************************************
    await deploy('meta-morpho', async () => {
        const { taskId, tx }: TaskTransaction = await mainnetAutomation.createBatchExecTask({
            name: 'Meta Morpho Cap Updater',
            web3FunctionHash: ipfsDeployment,
            web3FunctionArgs: {
                sendSlackMessages: true,
            },
            trigger: {
                type: TriggerType.TIME,
                interval: hourInMilliseconds,
            },
        })

        await tx.wait()
        await mainnetManagement.secrets.set(
            {
                SLACK_WEBHOOK_URL: slackWebhookUrl,
            },
            taskId,
        )
    })

    // *****************************************************************************************************************
    // ********** XCHAIN ORACLE TICKER *********************************************************************************
    // *****************************************************************************************************************
    await deploy('xchain-oracle-ticker', async () => {
        const dsNoteInterface = new ethers.utils.Interface(dsNoteAbi)

        const { taskId: arbitrumTaskId, tx: arbitrumTx }: TaskTransaction = await mainnetAutomation.createBatchExecTask(
            {
                name: 'XChain DSR Oracle Ticker [Arbitrum]',
                web3FunctionHash: ipfsDeployment,
                web3FunctionArgs: {
                    forwarder: addresses.mainnet.dsrForwarders.arbitrum,
                    maxDelta: '', // Max rho delta
                    gasLimit: '500000',
                    isBridgingArbitrumStyle: true,
                    maxFeePerGas: '',
                    baseFee: '',
                    sendSlackMessages: true,
                },
                trigger: {
                    type: TriggerType.EVENT,
                    filter: {
                        address: addresses.mainnet.pauseProxy,
                        topics: [[dsNoteInterface.getEventTopic('LogNote')]],
                    },
                    blockConfirmations: 0,
                },
            },
        )

        await arbitrumTx.wait()
        await mainnetManagement.secrets.set(
            {
                SLACK_WEBHOOK_URL: slackWebhookUrl,
            },
            arbitrumTaskId,
        )

        const { taskId: baseTaskId, tx: baseTx }: TaskTransaction = await mainnetAutomation.createBatchExecTask({
            name: 'XChain DSR Oracle Ticker [Base]',
            web3FunctionHash: ipfsDeployment,
            web3FunctionArgs: {
                forwarder: addresses.mainnet.dsrForwarders.base,
                maxDelta: '', // Max rho delta
                gasLimit: '500000',
                isBridgingArbitrumStyle: false,
                maxFeePerGas: '0',
                baseFee: '0',
                sendSlackMessages: true,
            },
            trigger: {
                type: TriggerType.EVENT,
                filter: {
                    address: addresses.mainnet.pauseProxy,
                    topics: [[dsNoteInterface.getEventTopic('LogNote')]],
                },
                blockConfirmations: 0,
            },
        })

        await baseTx.wait()
        await mainnetManagement.secrets.set(
            {
                SLACK_WEBHOOK_URL: slackWebhookUrl,
            },
            baseTaskId,
        )

        const { taskId: optimismTaskId, tx: optimismTx }: TaskTransaction = await mainnetAutomation.createBatchExecTask(
            {
                name: 'XChain DSR Oracle Ticker [Optimism]',
                web3FunctionHash: ipfsDeployment,
                web3FunctionArgs: {
                    forwarder: addresses.mainnet.dsrForwarders.optimism,
                    maxDelta: '', // Max rho delta
                    gasLimit: '500000',
                    isBridgingArbitrumStyle: false,
                    maxFeePerGas: '0',
                    baseFee: '0',
                    sendSlackMessages: true,
                },
                trigger: {
                    type: TriggerType.EVENT,
                    filter: {
                        address: addresses.mainnet.pauseProxy,
                        topics: [[dsNoteInterface.getEventTopic('LogNote')]],
                    },
                    blockConfirmations: 0,
                },
            },
        )

        await optimismTx.wait()
        await mainnetManagement.secrets.set(
            {
                SLACK_WEBHOOK_URL: slackWebhookUrl,
            },
            optimismTaskId,
        )
    })
})()
