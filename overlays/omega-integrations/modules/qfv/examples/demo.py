from qfv.engine import Vector3, Mesh, FieldEmitter, FieldDeformer, VisemeFusion, FuseInput
mesh = Mesh((Vector3(0.3,0,0), Vector3(0,0.3,0)))
deformer = FieldDeformer([FieldEmitter('vortex',Vector3(0,0,0),0.5,1.0)])
result = deformer.deform(mesh,0.25)
visemes = VisemeFusion().process(FuseInput(1_000_000, [1]+[0]*13, [0,1]+[0]*12, .5, .5))
print('QFV frame: ',result.vertices)
print('Viseme sum: ',round(sum(visemes),6))
