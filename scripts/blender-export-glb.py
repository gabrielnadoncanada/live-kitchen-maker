# Export batch d'assets Blender vers GLB pour le viewer Three.js.
# Usage :
#   & "D:\Blender 5.1\blender.exe" -b -P scripts/blender-export-glb.py -- <dossier_blend_ou_fichier> <dossier_sortie>
#
# Puis TOUJOURS optimiser pour le web (≈14× plus léger : textures 512 WebP +
# compression meshopt — l'electric_stove est passé de 2,49 Mo à 174 Ko) :
#   npx --yes @gltf-transform/cli optimize <in>.glb <out>.glb --texture-compress webp --texture-size 512 --compress meshopt
# Côté viewer : GLTFLoader + MeshoptDecoder (three/examples/jsm/libs/meshopt_decoder.module.js).
#
# Pour chaque .blend : ouvre le fichier, applique les modificateurs (les assets
# Home Builder sont des Geometry Nodes — sans bake ils exportent des cages vides,
# cf. bug HB #3 documenté dans dilamco_render/docs/hb-bugs.md), recentre au sol,
# exporte en GLB (textures embarquées, compression désactivée pour rester lisible
# par GLTFLoader sans plugin Draco — activer export_draco_mesh_compression_enable
# si le viewer charge DRACOLoader).
import bpy
import os
import sys


def export_blend(blend_path, out_dir):
    bpy.ops.wm.open_mainfile(filepath=blend_path)
    # appliquer les modificateurs sur tous les meshes visibles (bake des geonodes)
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH' or not obj.visible_get():
            continue
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except RuntimeError:
                pass  # modificateur non applicable (désactivé, etc.)
    # retirer les objets non exportables (annotations, empties de cote, wires)
    for obj in list(bpy.data.objects):
        is_wire = obj.type == 'MESH' and obj.display_type == 'WIRE'
        is_text = obj.type in {'FONT', 'CURVE'} and 'Text' in obj.name
        if is_wire or is_text:
            bpy.data.objects.remove(obj, do_unlink=True)
    name = os.path.splitext(os.path.basename(blend_path))[0].replace(' ', '_').lower()
    out_path = os.path.join(out_dir, name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        use_visible=True,
        export_animations=False,
    )
    print(f'[export-glb] {blend_path} -> {out_path}')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) < 2:
        print('Usage: blender -b -P blender-export-glb.py -- <src.blend|dossier> <dossier_sortie>')
        sys.exit(1)
    src, out_dir = argv[0], argv[1]
    os.makedirs(out_dir, exist_ok=True)
    if os.path.isdir(src):
        blends = [os.path.join(r, f) for r, _, fs in os.walk(src) for f in fs if f.endswith('.blend')]
    else:
        blends = [src]
    if not blends:
        print(f'[export-glb] aucun .blend dans {src}')
        sys.exit(1)
    for b in blends:
        export_blend(b, out_dir)
    print(f'[export-glb] {len(blends)} fichier(s) exporté(s) vers {out_dir}')


main()
