// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;

interface IExecutor {
    function chainId() external view returns(bytes32);
    function controller() external view returns(address);
    function queue(
        address[] memory targets,
        uint256[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas,
        bool[] memory withDelegatecalls
    ) external;
}

contract MockAMB {
    address internal _executor;
    address internal _messageSender;
    bytes32 internal _messageSourceChainId;

    constructor(address __executor) {
        _executor = __executor;
        _messageSourceChainId = IExecutor(__executor).chainId();
        _messageSender = IExecutor(__executor).controller();
    }

    function messageSourceChainId() public view returns(bytes32) {
        return _messageSourceChainId;
    }

    function messageSender() public view returns(address) {
        return _messageSender;
    }

    function setMessageSourceChainId(bytes32 __messageSourceChainId) public {
        _messageSourceChainId = __messageSourceChainId;
    }

    function setMessageSender(address __messageSender) public {
        _messageSender = __messageSender;
    }

    function __callQueueOnExecutor(address _payload) public {
        address[] memory targets = new address[](1);
        targets[0] = address(_payload);
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        string[] memory signatures = new string[](1);
        signatures[0] = "execute()";
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = "";
        bool[] memory withDelegatecalls = new bool[](1);
        withDelegatecalls[0] = true;

        IExecutor(_executor).queue(
            targets,
            values,
            signatures,
            calldatas,
            withDelegatecalls
        );
    }
}
