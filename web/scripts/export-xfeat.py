# Regenerates public/ml/xfeat-core.bin from XFeat's published weights (verlab/accelerated_features, weights/xfeat.pt, Apache-2.0).
# Run by hand, never in CI: python3 -m venv v && v/bin/pip install torch numpy pillow && v/bin/python export-xfeat.py (from a folder holding xfeat.pt).
# The network below is an own re-implementation of the published architecture; the weights are loaded with weights_only=True, so no code from them runs.
# The reference crop at the end needs a photo; the checked-in fixture (src/app/vision/features/xfeat/xfeat.reference.json) was made from one.
import json, struct
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image

class Basic(nn.Module):
    def __init__(self, cin, cout, k=3, stride=1, pad=1):
        super().__init__()
        self.layer = nn.Sequential(nn.Conv2d(cin, cout, k, padding=pad, stride=stride, bias=False), nn.BatchNorm2d(cout, affine=False), nn.ReLU())
    def forward(self, x):
        return self.layer(x)

def basic(cin, cout, k=3, stride=1, pad=1):
    return Basic(cin, cout, k, stride, pad)

class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.norm = nn.InstanceNorm2d(1)
        self.skip1 = nn.Sequential(nn.AvgPool2d(4, stride=4), nn.Conv2d(1, 24, 1, stride=1, padding=0))
        self.block1 = nn.Sequential(basic(1, 4), basic(4, 8, stride=2), basic(8, 8), basic(8, 24, stride=2))
        self.block2 = nn.Sequential(basic(24, 24), basic(24, 24))
        self.block3 = nn.Sequential(basic(24, 64, stride=2), basic(64, 64), basic(64, 64, 1, 1, 0))
        self.block4 = nn.Sequential(basic(64, 64, stride=2), basic(64, 64), basic(64, 64))
        self.block5 = nn.Sequential(basic(64, 128, stride=2), basic(128, 128), basic(128, 128), basic(128, 64, 1, 1, 0))
        self.block_fusion = nn.Sequential(basic(64, 64), basic(64, 64), nn.Conv2d(64, 64, 1, padding=0))
        self.heatmap_head = nn.Sequential(basic(64, 64, 1, 1, 0), basic(64, 64, 1, 1, 0), nn.Conv2d(64, 1, 1), nn.Sigmoid())
        self.keypoint_head = nn.Sequential(basic(64, 64, 1, 1, 0), basic(64, 64, 1, 1, 0), basic(64, 64, 1, 1, 0), nn.Conv2d(64, 65, 1))

    @staticmethod
    def unfold(x, ws=8):
        B, C, H, W = x.shape
        x = x.unfold(2, ws, ws).unfold(3, ws, ws).reshape(B, C, H // ws, W // ws, ws ** 2)
        return x.permute(0, 1, 4, 2, 3).reshape(B, -1, H // ws, W // ws)

    def forward(self, x):
        with torch.no_grad():
            x = x.mean(dim=1, keepdim=True)
            x = self.norm(x)
        x1 = self.block1(x)
        x2 = self.block2(x1 + self.skip1(x))
        x3 = self.block3(x2); x4 = self.block4(x3); x5 = self.block5(x4)
        x4 = F.interpolate(x4, (x3.shape[-2], x3.shape[-1]), mode='bilinear')
        x5 = F.interpolate(x5, (x3.shape[-2], x3.shape[-1]), mode='bilinear')
        feats = self.block_fusion(x3 + x4 + x5)
        return feats, self.keypoint_head(self.unfold(x)), self.heatmap_head(feats)

state = torch.load('xfeat.pt', map_location='cpu', weights_only=True)  # nosemgrep: trailofbits.python.pickles-in-pytorch.pickles-in-pytorch (weights_only=True reads plain tensors, no code runs)
net = Net().eval()
missing = net.load_state_dict({k: v for k, v in state.items() if not k.startswith('fine_matcher')}, strict=True)
print('loaded', missing)

layers = []; blob = []; offset = 0
def add(name, conv, bn=None, relu=False, sigmoid=False):
    global offset
    w = conv.weight.detach().double()
    b = conv.bias.detach().double() if conv.bias is not None else torch.zeros(conv.out_channels, dtype=torch.double)
    if bn is not None:
        scale = 1.0 / torch.sqrt(bn.running_var.double() + bn.eps)
        w = w * scale.view(-1, 1, 1, 1)
        b = (b - bn.running_mean.double()) * scale
    w = w.float().numpy().astype('<f4'); b = b.float().numpy().astype('<f4')
    layers.append(dict(name=name, cin=conv.in_channels, cout=conv.out_channels, k=conv.kernel_size[0], stride=conv.stride[0], pad=conv.padding[0], relu=relu, sigmoid=sigmoid, weights=offset, bias=offset + w.size))
    blob.append(w.tobytes()); blob.append(b.tobytes()); offset += w.size + b.size

def walk(name, seq):
    for i, m in enumerate(seq):
        if isinstance(m, Basic): add(f'{name}.{i}', m.layer[0], m.layer[1], relu=True)
        elif isinstance(m, nn.Conv2d): add(f'{name}.{i}', m)
        elif isinstance(m, nn.Sigmoid): layers[-1]['sigmoid'] = True

add('skip1', net.skip1[1])
for n in ['block1', 'block2', 'block3', 'block4', 'block5', 'block_fusion', 'heatmap_head', 'keypoint_head']:
    walk(n, getattr(net, n))
header = json.dumps(dict(layers=layers, floats=offset)).encode()
open('xfeat-core.bin', 'wb').write(struct.pack('<I', len(header)) + header + b''.join(blob))
print('layers', len(layers), 'floats', offset, 'MB', round(offset * 4 / 1e6, 2))

img = Image.open('/tmp/claude-0/-home-user-ExposureBuddy/1b69e43f-1a63-58c8-900d-52dffb774e8d/scratchpad/proto/small07.png').convert('L').crop((150, 300, 150 + 64, 300 + 64))
x = torch.from_numpy(np.asarray(img).astype('float32'))[None, None]
with torch.no_grad(): feats, kp, hm = net(x)
x.numpy().astype('<f4').tofile('ref-input.bin')
for n, t in [('feats', feats), ('kp', kp), ('hm', hm)]:
    t.numpy().astype('<f4').tofile(f'ref-{n}.bin'); print(n, tuple(t.shape))
