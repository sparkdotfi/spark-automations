export const addresses = {
    mainnet: {
        capAutomator: '0x2276f52afba7Cf2525fd0a050DF464AC8532d0ef',
        d3mHub: '0x12F36cdEA3A28C35aC8C6Cc71D9265c17C74A27F',
        d3mPool: '0xAfA2DD8a0594B2B24B59de405Da9338C4Ce23437',
        executor: '0x3300f198988e4C9C63F75dF86De36421f06af8c4',
        killSwitchOracle: '0x909A86f78e1cdEd68F9c2Fe2c9CD922c401abe82',
        metaMorpho: '0x73e65DBD630f90604062f6E02fAb9138e713edD9',
        multicall: '0xeefBa1e63905eF1D7ACbA5a8513c70307C1cE441',
        pauseProxy: '0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB',
        pool: '0xC13e21B648A5Ee794902342038FF3aDAB66BE987',
        pot: '0x197E90f9FAD81970bA7976f33CbD77088E5D7cf7',
        protocolDataProvider: '0xFc21d6d146E6086B8359705C8b28512a983db0cb',
        reth: '0xae78736Cd615f374D3085123A210448E74Fc6393',
        susds: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD',
        vat: '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B',
        wbtc: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        wsteth: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
        dsrForwarders: {
            arbitrumStyle: {
                arbitrum: '0x7F36E7F562Ee3f320644F6031e03E12a02B85799',
            },
            optimismStyle: {
                base: '0x8Ed551D485701fe489c215E13E42F6fc59563e0e',
                optimism: '0x4042127DecC0cF7cc0966791abebf7F76294DeF3',
            },
            updatedOptimismStyle: {
                worldChain: '0xA34437dAAE56A7CC6DC757048933D7777b3e547B',
            },
        },
        ssrForwarders: {
            optimismStyle: {
                base: '0xB2833392527f41262eB0E3C7b47AFbe030ef188E',
            },
        },
        priceSources: {
            wbtcBtc: '0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23',
            stethEth: '0x86392dC19c0b719886221c78AB11eb8Cf5c52812',
        },
    },
    gnosis: {
        executor: '0xc4218C1127cB24a0D6c1e7D25dc34e10f2625f5A',
        multicall: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
} as const
