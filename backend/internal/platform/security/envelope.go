package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
)

type Envelope struct {
	keys    map[int][]byte
	current int
}

func NewEnvelope(keys map[int][]byte, current int) (Envelope, error) {
	cloned := make(map[int][]byte, len(keys))
	for version, key := range keys {
		if version < 1 || len(key) != 32 {
			return Envelope{}, errors.New("envelope keys must be versioned AES-256 keys")
		}
		cloned[version] = append([]byte(nil), key...)
	}
	if _, ok := cloned[current]; !ok {
		return Envelope{}, errors.New("current envelope key is missing")
	}
	return Envelope{keys: cloned, current: current}, nil
}

func (e Envelope) Encrypt(plaintext []byte) (ciphertext, nonce []byte, version int, err error) {
	gcm, err := e.gcm(e.current)
	if err != nil {
		return nil, nil, 0, err
	}
	nonce = make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, nil, 0, fmt.Errorf("generate envelope nonce: %w", err)
	}
	ciphertext = gcm.Seal(nil, nonce, plaintext, []byte("wordweave/openrouter/v1"))
	return ciphertext, nonce, e.current, nil
}

func (e Envelope) Decrypt(ciphertext, nonce []byte, version int) ([]byte, error) {
	gcm, err := e.gcm(version)
	if err != nil {
		return nil, err
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, []byte("wordweave/openrouter/v1"))
	if err != nil {
		return nil, errors.New("decrypt envelope: authentication failed")
	}
	return plaintext, nil
}

func (e Envelope) gcm(version int) (cipher.AEAD, error) {
	key, ok := e.keys[version]
	if !ok {
		return nil, fmt.Errorf("envelope key version %d is unavailable", version)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("initialize AES: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("initialize AES-GCM: %w", err)
	}
	return gcm, nil
}
