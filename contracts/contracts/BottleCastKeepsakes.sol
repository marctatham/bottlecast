// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title BottleCast keepsakes
 * @notice A message found in a bottle on BottleCast and sealed by its finder. Keepsakes are mementos, not money.
 * @dev The Worker's minter seals one kept bottle at a time (spec §1.7, decisions.md 2026-10-18). Everything but the
 * picture lives on-chain: `tokenURI` builds its JSON from the stored record, and only the image is a hosted file, one
 * per shape and glass, under `imageBase`.
 */
contract BottleCastKeepsakes is ERC721, AccessControl, IERC4906 {
    using Strings for string;
    using Strings for uint256;

    /// @notice The role the Worker's minter holds.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice The longest message, in UTF-8 bytes: the app's `MessageLimits.MAX_BYTES`, which the rules check too.
    uint256 public constant MAX_TEXT_BYTES = 280;

    /// @notice The longest pen name, in UTF-16 units: the app's `PEN_NAME_MAX`, counted as the app and the rules count it.
    uint256 public constant MAX_PEN_NAME_UNITS = 20;

    /// @dev ERC-4906 fixes its interface id rather than deriving it, since the interface has only events.
    bytes4 private constant ERC4906_INTERFACE_ID = 0x49064906;

    /// @notice What a keepsake holds, written once when it's sealed.
    struct Keepsake {
        /// The bottle's Firestore id.
        string messageId;
        /// The message, at most 280 bytes.
        string text;
        /// The pen name the writer signed this bottle with, or empty for "A stranger at sea".
        string penName;
        /// "Bottled by a verified account": an HMAC over the writer's uid and the messageId, which names nobody.
        bytes32 writerMark;
        /// When the bottle was cast, in seconds since the Unix epoch.
        uint64 castAt;
        /// 0 sea glass, 1 amber, 2 moonglass: the app's `BottleTint` order.
        uint8 glass;
    }

    /// @notice Where the pictures live. A token's picture is this, then `<shape>-<glass>.png`.
    string public imageBase;

    uint256 private _lastTokenId;
    mapping(uint256 tokenId => Keepsake) private _keepsakes;
    mapping(bytes32 messageIdHash => uint256 tokenId) private _tokenOfMessage;

    /// @notice ERC-7572: the collection's metadata changed.
    event ContractURIUpdated();

    error EmptyMessageId();
    error TextTooLong(uint256 bytesLength);
    error PenNameTooLong(uint256 utf16Units);
    error UnknownGlass(uint8 glass);

    constructor(address admin, address minter, string memory imageBase_) ERC721("BottleCast keepsakes", "BOTTLE") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
        imageBase = imageBase_;
    }

    /**
     * @notice Seals a bottle into `to`'s wallet and returns its token id. Ids count up from 1.
     * @dev Idempotent per messageId: a bottle that's already sealed returns its token, and nothing is minted or moved,
     * whoever `to` is. So a mint that's sent twice, or retried after a timeout, is safe. `_mint` rather than
     * `_safeMint`, so no receiver hook runs.
     */
    function mint(
        address to,
        string calldata messageId,
        string calldata text,
        uint64 castAt,
        string calldata penName,
        bytes32 writerMark,
        uint8 glass
    ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        if (bytes(messageId).length == 0) revert EmptyMessageId();
        if (bytes(text).length > MAX_TEXT_BYTES) revert TextTooLong(bytes(text).length);
        uint256 penNameUnits = _utf16Length(bytes(penName));
        if (penNameUnits > MAX_PEN_NAME_UNITS) revert PenNameTooLong(penNameUnits);
        if (glass > 2) revert UnknownGlass(glass);

        bytes32 key = keccak256(bytes(messageId));
        tokenId = _tokenOfMessage[key];
        if (tokenId != 0) return tokenId;

        tokenId = ++_lastTokenId;
        _tokenOfMessage[key] = tokenId;
        _keepsakes[tokenId] = Keepsake(messageId, text, penName, writerMark, castAt, glass);
        _mint(to, tokenId);
    }

    /// @notice The token a bottle was sealed as, or 0 if it hasn't been.
    function tokenOfMessage(string calldata messageId) external view returns (uint256) {
        return _tokenOfMessage[keccak256(bytes(messageId))];
    }

    /// @notice The record a keepsake was sealed with.
    function keepsake(uint256 tokenId) external view returns (Keepsake memory) {
        _requireOwned(tokenId);
        return _keepsakes[tokenId];
    }

    /**
     * @notice The keepsake's metadata, as base64 JSON: its words as the description, its picture, and its shape,
     * glass, cast date, pen name (only when it has one) and verified mark as attributes.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Keepsake storage k = _keepsakes[tokenId];
        (string memory shapeFile, string memory shapeName) = _shape(_shapeOf(k.messageId));
        (string memory glassFile, string memory glassName) = _glass(k.glass);
        string memory penName = bytes(k.penName).length == 0
            ? ""
            : string.concat(',{"trait_type":"Pen name","value":"', k.penName.escapeJSON(), '"}');
        string memory attributes = string.concat(
            '[{"trait_type":"Shape","value":"',
            shapeName,
            '"},{"trait_type":"Glass","value":"',
            glassName,
            '"},{"trait_type":"Cast","display_type":"date","value":',
            uint256(k.castAt).toString(),
            "}",
            penName,
            ',{"trait_type":"Writer","value":"A verified account"}]'
        );
        return _jsonDataUri(
            string.concat(
                '{"name":"BottleCast #',
                tokenId.toString(),
                '","description":"',
                k.text.escapeJSON(),
                '","image":"',
                _picture(shapeFile, glassFile),
                '","attributes":',
                attributes,
                "}"
            )
        );
    }

    /// @notice ERC-7572's collection metadata, as base64 JSON.
    function contractURI() external view returns (string memory) {
        return _jsonDataUri(
            string.concat(
                '{"name":"',
                name(),
                '","description":"Messages found in bottles on BottleCast and sealed by their finders. ',
                'Keepsakes are mementos, not money.","image":"',
                _picture("classic", "seaglass"),
                '","external_link":"https://play.google.com/store/apps/details?id=com.bottlecast.app"}'
            )
        );
    }

    /**
     * @notice Moves the pictures, to a domain of BottleCast's own, say. Only the admin can.
     * @dev Every token's picture changes, so it tells marketplaces to refresh them all (ERC-4906), and the collection's
     * own (ERC-7572).
     */
    function setImageBase(string calldata imageBase_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        imageBase = imageBase_;
        emit BatchMetadataUpdate(1, type(uint256).max);
        emit ContractURIUpdated();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl, IERC165)
        returns (bool)
    {
        return interfaceId == ERC4906_INTERFACE_ID || super.supportsInterface(interfaceId);
    }

    function _picture(string memory shapeFile, string memory glassFile) private view returns (string memory) {
        return string.concat(imageBase.escapeJSON(), shapeFile, "-", glassFile, ".png");
    }

    /// @dev The bottle's shape, seeded as the app seeds it (`bottleLookFor`): byte 0 of SHA-256(messageId), mod 3.
    function _shapeOf(string memory messageId) private pure returns (uint8) {
        return uint8(sha256(bytes(messageId))[0]) % 3;
    }

    /// @dev A shape's picture-file word and trait name, in the app's `BottleSilhouette` order.
    function _shape(uint8 shape) private pure returns (string memory file, string memory traitName) {
        if (shape == 0) return ("classic", "Classic");
        if (shape == 1) return ("flask", "Flask");
        return ("gourd", "Gourd");
    }

    /// @dev A glass's picture-file word and trait name, in the app's `BottleTint` order.
    function _glass(uint8 glass) private pure returns (string memory file, string memory traitName) {
        if (glass == 0) return ("seaglass", "Sea glass");
        if (glass == 1) return ("amber", "Amber glass");
        return ("moonglass", "Moonglass");
    }

    function _jsonDataUri(string memory json) private pure returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /**
     * @dev A string's length in UTF-16 units, as the app and the rules count a pen name: one per character, and two for
     * a character outside the Basic Multilingual Plane (an emoji, say), which UTF-8 writes in 4 bytes. It steps from
     * lead byte to lead byte, so malformed UTF-8 still counts at least a unit for every 3 bytes.
     */
    function _utf16Length(bytes calldata s) private pure returns (uint256 units) {
        uint256 i;
        while (i < s.length) {
            uint8 lead = uint8(s[i]);
            if (lead >= 0xF0) {
                units += 2;
                i += 4;
            } else {
                units += 1;
                i += lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1;
            }
        }
    }
}
