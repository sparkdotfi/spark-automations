import fs from 'fs'

import { listDirectories } from './utils'

const w3fNames = listDirectories('./web3-functions')

let ipfsDeployments: Record<string, string> = {}
try {
    ipfsDeployments = JSON.parse(fs.readFileSync('./scripts/pre-deployments.json'))
} catch (error) {
    fs.writeFileSync('./scripts/pre-deployments.json', '{}')
}

for (const w3fName of w3fNames) {
    console.log(`Uploading ${w3fName} to IPFS...`)

    const deploymentOutput = require('child_process').execSync(`npx hardhat w3f-deploy ${w3fName}`)
    const cid = deploymentOutput.toString().split(' ')[8].slice(0, -4)
    console.log(`New ${w3fName} CID: ${cid}`)

    ipfsDeployments[w3fName] = cid
}

fs.writeFileSync('./scripts/pre-deployments.json', JSON.stringify(ipfsDeployments, null, 4).concat('\n'))
