"""REINFORCE with a learned value baseline (vanilla policy gradient)."""
import numpy as np
import torch
import torch.nn as nn


class PolicyValueNet(nn.Module):
    def __init__(self, state_dim, n_actions, hidden=128):
        super().__init__()
        self.body = nn.Sequential(
            nn.Linear(state_dim, hidden), nn.Tanh(),
            nn.Linear(hidden, hidden), nn.Tanh(),
        )
        self.pi = nn.Linear(hidden, n_actions)
        self.v = nn.Linear(hidden, 1)

    def forward(self, x):
        h = self.body(x)
        return self.pi(h), self.v(h).squeeze(-1)

    @torch.no_grad()
    def act(self, state, greedy=False):
        logits, _ = self(torch.as_tensor(state).unsqueeze(0))
        if greedy:
            return int(logits.argmax(-1))
        return int(torch.distributions.Categorical(logits=logits).sample())


def run_episode(env, net, benchmark, greedy=False):
    s = env.reset(benchmark)
    states, actions, rewards = [], [], []
    done = False
    while not done:
        a = net.act(s, greedy=greedy)
        s2, r, done = env.step(a)
        states.append(s)
        actions.append(a)
        rewards.append(r)
        s = s2
    return {
        "states": np.stack(states), "actions": np.array(actions), "rewards": np.array(rewards),
        "start": env.start, "final": env.count, "o0": env.o0, "no_effect": env.no_effect,
    }


def reinforce_update(net, opt, episodes, gamma=1.0, entropy_coef=0.01, value_coef=0.5):
    """One policy-gradient step on a batch of complete episodes."""
    S, A, G = [], [], []
    for ep in episodes:
        ret, rets = 0.0, []
        for r in ep["rewards"][::-1]:
            ret = r + gamma * ret
            rets.append(ret)
        S.append(ep["states"])
        A.append(ep["actions"])
        G.append(np.array(rets[::-1], dtype=np.float32))
    S = torch.as_tensor(np.concatenate(S))
    A = torch.as_tensor(np.concatenate(A))
    G = torch.as_tensor(np.concatenate(G))

    logits, values = net(S)
    dist = torch.distributions.Categorical(logits=logits)
    adv = G - values.detach()
    adv = (adv - adv.mean()) / (adv.std() + 1e-8)
    policy_loss = -(dist.log_prob(A) * adv).mean()
    value_loss = (G - values).pow(2).mean()
    entropy = dist.entropy().mean()
    loss = policy_loss + value_coef * value_loss - entropy_coef * entropy

    opt.zero_grad()
    loss.backward()
    nn.utils.clip_grad_norm_(net.parameters(), 0.5)
    opt.step()
    return {"policy_loss": float(policy_loss), "value_loss": float(value_loss), "entropy": float(entropy)}
