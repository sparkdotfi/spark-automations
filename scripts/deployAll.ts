import * as fs from 'fs'
import { ethers } from 'ethers'
import { AutomateSDK, TaskTransaction, TriggerType, Web3Function } from '@gelatonetwork/automate-sdk'

import { poolAbi } from '../abis'
import { addresses } from '../utils'

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
        const poolInterface = new ethers.utils.Interface(poolAbi)

        const { taskId, tx }: TaskTransaction = await mainnetAutomation.createBatchExecTask({
            name: 'Cap Automator',
            web3FunctionHash: ipfsDeployment,
            web3FunctionArgs: {
                threshold: 5000, // less than 50% of the gap left under the cap
                performGasCheck: true,
                sendSlackMessages: true,
            },
            trigger: {
                type: TriggerType.EVENT,
                filter: {
                    address: addresses.mainnet.pool,
                    topics: [
                        [
                            poolInterface.getEventTopic('Supply'),
                            poolInterface.getEventTopic('Withdraw'),
                            poolInterface.getEventTopic('Borrow'),
                            poolInterface.getEventTopic('Repay'),
                        ],
                    ],
                },
                blockConfirmations: 0,
            },
        })
        await tx.wait()
        await mainnetManagement.secrets.set({
            SLACK_WEBHOOK_URL: slackWebhookUrl,
            ETHERSCAN_API_KEY: etherscanApiKey,
        }, taskId)
    })

    // *****************************************************************************************************************
    // ********** D3M TICKER *******************************************************************************************
    // *****************************************************************************************************************
    await deploy('d3m-ticker', async () => {
        // Put an actual deployment of d3m-ticker
    })

    // *****************************************************************************************************************
    // ********** GOVERNANCE EXECUTOR **********************************************************************************
    // *****************************************************************************************************************
    await deploy('governance-executor', async () => {
        // Put an actual deployment of governance-executor
    })

    // *****************************************************************************************************************
    // ********** KILL SWITCH ******************************************************************************************
    // *****************************************************************************************************************
    await deploy('kill-switch', async () => {
        // Put an actual deployment of kill-switch
    })

    // *****************************************************************************************************************
    // ********** META MORPHO ******************************************************************************************
    // *****************************************************************************************************************
    await deploy('meta-morpho', async () => {
        // Put an actual deployment of meta-morpho
    })

    // *****************************************************************************************************************
    // ********** XCHAIN ORACLE TICKER *********************************************************************************
    // *****************************************************************************************************************
    await deploy('xchain-oracle-ticker', async () => {
        // Put an actual deployment of xchain-oracle-ticker
    })
})()
